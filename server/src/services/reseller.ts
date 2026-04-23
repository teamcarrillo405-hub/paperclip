import Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { resellerPartners, resellerClients, companies, billingSubscriptions } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { BILLING_PLANS, isBillingPlanId, type BillingPlanId } from "./billing-plans.js";

let cachedClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  cachedClient = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  return cachedClient;
}

function generatePartnerCode(): string {
  return randomBytes(6).toString("hex").toUpperCase();
}

export interface ResellerMetrics {
  totalClientCount: number;
  monthlyRecurringRevenueCents: number;
  commissionsThisMonthCents: number;
  allTimeEarningsCents: number;
  commissionPercent: number;
  stripeConnectStatus: string;
  partnerCode: string;
}

export interface ResellerClientRow {
  id: string;
  companyId: string;
  companyName: string;
  planId: BillingPlanId | null;
  mrrCents: number;
  commissionCents: number;
  commissionPercent: number;
  joinedAt: Date;
  activeAt: Date | null;
  stripeSubscriptionId: string | null;
}

export function resellerService(db: Db) {
  async function getPartnerById(resellerId: string) {
    const [row] = await db
      .select()
      .from(resellerPartners)
      .where(eq(resellerPartners.id, resellerId))
      .limit(1);
    return row ?? null;
  }

  async function getPartnerByEmail(email: string) {
    const [row] = await db
      .select()
      .from(resellerPartners)
      .where(eq(resellerPartners.email, email))
      .limit(1);
    return row ?? null;
  }

  async function getPartnerByCode(code: string) {
    const [row] = await db
      .select()
      .from(resellerPartners)
      .where(eq(resellerPartners.partnerCode, code))
      .limit(1);
    return row ?? null;
  }

  async function getPartnerByStripeAccountId(stripeAccountId: string) {
    const [row] = await db
      .select()
      .from(resellerPartners)
      .where(eq(resellerPartners.stripeConnectAccountId, stripeAccountId))
      .limit(1);
    return row ?? null;
  }

  async function createResellerAccount(
    name: string,
    email: string,
    companyName?: string,
  ): Promise<{ resellerId: string; partnerCode: string; stripeAccountId: string; onboardingUrl: string }> {
    const existing = await getPartnerByEmail(email);
    if (existing) {
      throw badRequest("A partner account already exists for this email.");
    }
    const stripe = getStripeClient();
    const account = await stripe.accounts.create({
      type: "express",
      email,
      capabilities: {
        transfers: { requested: true },
      },
      business_profile: {
        name: companyName ?? name,
      },
      metadata: { resellerEmail: email },
    });

    const partnerCode = generatePartnerCode();
    const [inserted] = await db
      .insert(resellerPartners)
      .values({
        name,
        email,
        company: companyName ?? null,
        partnerCode,
        stripeConnectAccountId: account.id,
        stripeConnectStatus: "pending",
        commissionPercent: 20,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to create reseller partner row");
    }

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${appUrl}/partner?refresh=1`,
      return_url: `${appUrl}/partner?onboarded=1`,
      type: "account_onboarding",
    });

    logger.info({ resellerId: inserted.id, email }, "reseller: created new partner account");

    return {
      resellerId: inserted.id,
      partnerCode,
      stripeAccountId: account.id,
      onboardingUrl: link.url,
    };
  }

  async function getResellerOnboardingLink(resellerId: string): Promise<{ url: string }> {
    const partner = await getPartnerById(resellerId);
    if (!partner) throw notFound("Reseller not found");
    if (!partner.stripeConnectAccountId) {
      throw badRequest("Reseller does not yet have a Stripe Connect account");
    }
    const stripe = getStripeClient();
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const link = await stripe.accountLinks.create({
      account: partner.stripeConnectAccountId,
      refresh_url: `${appUrl}/partner?refresh=1`,
      return_url: `${appUrl}/partner?onboarded=1`,
      type: "account_onboarding",
    });
    return { url: link.url };
  }

  async function getResellerDashboardLink(resellerId: string): Promise<{ url: string }> {
    const partner = await getPartnerById(resellerId);
    if (!partner) throw notFound("Reseller not found");
    if (!partner.stripeConnectAccountId) {
      throw badRequest("Reseller does not yet have a Stripe Connect account");
    }
    const stripe = getStripeClient();
    const link = await stripe.accounts.createLoginLink(partner.stripeConnectAccountId);
    return { url: link.url };
  }

  async function listClientsForReseller(resellerId: string): Promise<ResellerClientRow[]> {
    const rows = await db
      .select({
        id: resellerClients.id,
        companyId: resellerClients.companyId,
        companyName: companies.name,
        stripeSubscriptionId: resellerClients.stripeSubscriptionId,
        commissionPercent: resellerClients.commissionPercent,
        activeAt: resellerClients.activeAt,
        createdAt: resellerClients.createdAt,
        planId: billingSubscriptions.planId,
      })
      .from(resellerClients)
      .innerJoin(companies, eq(companies.id, resellerClients.companyId))
      .leftJoin(billingSubscriptions, eq(billingSubscriptions.companyId, resellerClients.companyId))
      .where(eq(resellerClients.resellerId, resellerId));

    return rows.map((row) => {
      const planId = isBillingPlanId(row.planId) ? row.planId : null;
      const priceCents = planId ? BILLING_PLANS[planId].price * 100 : 0;
      const commissionCents = Math.round((priceCents * row.commissionPercent) / 100);
      return {
        id: row.id,
        companyId: row.companyId,
        companyName: row.companyName,
        planId,
        mrrCents: priceCents,
        commissionCents,
        commissionPercent: row.commissionPercent,
        joinedAt: row.createdAt,
        activeAt: row.activeAt,
        stripeSubscriptionId: row.stripeSubscriptionId ?? null,
      };
    });
  }

  async function getResellerMetrics(resellerId: string): Promise<ResellerMetrics> {
    const partner = await getPartnerById(resellerId);
    if (!partner) throw notFound("Reseller not found");
    const clients = await listClientsForReseller(resellerId);
    const activeClients = clients.filter((c) => c.activeAt !== null);
    const mrrCents = activeClients.reduce((sum, c) => sum + c.mrrCents, 0);
    const commissionsThisMonthCents = activeClients.reduce((sum, c) => sum + c.commissionCents, 0);
    return {
      totalClientCount: activeClients.length,
      monthlyRecurringRevenueCents: mrrCents,
      commissionsThisMonthCents,
      allTimeEarningsCents: commissionsThisMonthCents,
      commissionPercent: partner.commissionPercent,
      stripeConnectStatus: partner.stripeConnectStatus,
      partnerCode: partner.partnerCode,
    };
  }

  async function refreshPartnerTotals(resellerId: string): Promise<void> {
    const metrics = await getResellerMetrics(resellerId);
    await db
      .update(resellerPartners)
      .set({
        totalClientCount: metrics.totalClientCount,
        totalMrrCents: metrics.monthlyRecurringRevenueCents,
        updatedAt: new Date(),
      })
      .where(eq(resellerPartners.id, resellerId));
  }

  async function attachClientToReseller(
    companyId: string,
    resellerId: string,
    options?: { stripeSubscriptionId?: string; markActive?: boolean },
  ): Promise<void> {
    const partner = await getPartnerById(resellerId);
    if (!partner) throw notFound("Reseller not found");

    const [existing] = await db
      .select()
      .from(resellerClients)
      .where(eq(resellerClients.companyId, companyId))
      .limit(1);

    const now = new Date();
    if (existing) {
      await db
        .update(resellerClients)
        .set({
          resellerId,
          stripeSubscriptionId: options?.stripeSubscriptionId ?? existing.stripeSubscriptionId,
          activeAt: options?.markActive ? now : existing.activeAt,
          updatedAt: now,
        })
        .where(eq(resellerClients.id, existing.id));
    } else {
      await db.insert(resellerClients).values({
        resellerId,
        companyId,
        stripeSubscriptionId: options?.stripeSubscriptionId ?? null,
        commissionPercent: partner.commissionPercent,
        activeAt: options?.markActive ? now : null,
      });
    }
    await refreshPartnerTotals(resellerId);
  }

  async function getClientByCompanyId(companyId: string) {
    const [row] = await db
      .select()
      .from(resellerClients)
      .where(eq(resellerClients.companyId, companyId))
      .limit(1);
    return row ?? null;
  }

  async function markClientActive(companyId: string, stripeSubscriptionId: string | null): Promise<void> {
    const client = await getClientByCompanyId(companyId);
    if (!client) return;
    await db
      .update(resellerClients)
      .set({
        stripeSubscriptionId: stripeSubscriptionId ?? client.stripeSubscriptionId,
        activeAt: client.activeAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(resellerClients.id, client.id));
    await refreshPartnerTotals(client.resellerId);
  }

  async function markClientActiveBySubscription(stripeSubscriptionId: string): Promise<void> {
    const [client] = await db
      .select()
      .from(resellerClients)
      .where(eq(resellerClients.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    if (!client) return;
    await db
      .update(resellerClients)
      .set({
        activeAt: client.activeAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(resellerClients.id, client.id));
    await refreshPartnerTotals(client.resellerId);
  }

  async function attachClientByPartnerCode(
    companyId: string,
    partnerCode: string,
  ): Promise<{ attached: boolean; resellerId: string | null }> {
    const partner = await getPartnerByCode(partnerCode);
    if (!partner) return { attached: false, resellerId: null };
    await attachClientToReseller(companyId, partner.id, { markActive: false });
    return { attached: true, resellerId: partner.id };
  }

  async function processResellerCommission(
    subscriptionId: string,
    amountCents: number,
  ): Promise<{ transferId: string | null; commissionCents: number }> {
    const [clientRow] = await db
      .select({
        id: resellerClients.id,
        commissionPercent: resellerClients.commissionPercent,
        resellerId: resellerClients.resellerId,
        stripeConnectAccountId: resellerPartners.stripeConnectAccountId,
        stripeConnectStatus: resellerPartners.stripeConnectStatus,
      })
      .from(resellerClients)
      .innerJoin(resellerPartners, eq(resellerPartners.id, resellerClients.resellerId))
      .where(eq(resellerClients.stripeSubscriptionId, subscriptionId))
      .limit(1);

    if (!clientRow) {
      return { transferId: null, commissionCents: 0 };
    }

    const commissionCents = Math.round((amountCents * clientRow.commissionPercent) / 100);
    if (commissionCents <= 0 || !clientRow.stripeConnectAccountId) {
      return { transferId: null, commissionCents };
    }
    if (clientRow.stripeConnectStatus !== "active") {
      logger.info(
        { resellerId: clientRow.resellerId, subscriptionId },
        "reseller: skipping commission transfer — Stripe Connect account not active",
      );
      return { transferId: null, commissionCents };
    }

    const stripe = getStripeClient();
    const transfer = await stripe.transfers.create({
      amount: commissionCents,
      currency: "usd",
      destination: clientRow.stripeConnectAccountId,
      description: `Avero AI partner commission for subscription ${subscriptionId}`,
      metadata: {
        resellerId: clientRow.resellerId,
        subscriptionId,
      },
    });
    logger.info(
      { resellerId: clientRow.resellerId, transferId: transfer.id, commissionCents },
      "reseller: processed commission transfer",
    );
    return { transferId: transfer.id, commissionCents };
  }

  async function updateStripeConnectStatus(
    stripeAccountId: string,
    detailsSubmitted: boolean,
    chargesEnabled: boolean,
    payoutsEnabled: boolean,
  ): Promise<void> {
    const status = chargesEnabled && payoutsEnabled ? "active" : detailsSubmitted ? "pending_review" : "pending";
    await db
      .update(resellerPartners)
      .set({ stripeConnectStatus: status, updatedAt: new Date() })
      .where(eq(resellerPartners.stripeConnectAccountId, stripeAccountId));
  }

  async function handleConnectWebhookEvent(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<{ received: true; type: string }> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET_CONNECT;
    if (!secret) {
      throw new Error("STRIPE_WEBHOOK_SECRET_CONNECT is not set");
    }
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await updateStripeConnectStatus(
          account.id,
          account.details_submitted ?? false,
          account.charges_enabled ?? false,
          account.payouts_enabled ?? false,
        );
        break;
      }
      case "payment_intent.succeeded":
      case "charge.succeeded":
      case "transfer.created": {
        logger.debug({ type: event.type }, "reseller: Connect event received");
        break;
      }
      default:
        logger.debug({ type: event.type }, "reseller: unhandled Connect event");
    }

    return { received: true, type: event.type };
  }

  async function getReferralLink(resellerId: string): Promise<{ url: string; partnerCode: string }> {
    const partner = await getPartnerById(resellerId);
    if (!partner) throw notFound("Reseller not found");
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    return {
      partnerCode: partner.partnerCode,
      url: `${appUrl}/signup?ref=${partner.partnerCode}`,
    };
  }

  return {
    createResellerAccount,
    getResellerOnboardingLink,
    getResellerDashboardLink,
    getResellerMetrics,
    listClientsForReseller,
    attachClientToReseller,
    attachClientByPartnerCode,
    markClientActive,
    markClientActiveBySubscription,
    processResellerCommission,
    updateStripeConnectStatus,
    handleConnectWebhookEvent,
    getReferralLink,
    getPartnerById,
    getPartnerByEmail,
    getPartnerByCode,
    getPartnerByStripeAccountId,
    getClientByCompanyId,
  };
}

export type ResellerService = ReturnType<typeof resellerService>;
