import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { billingSubscriptions, companies } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";
import {
  BILLING_PLANS,
  TRIAL_DAYS,
  getPlanPriceEnvKey,
  isBillingPlanId,
  type BillingPlanId,
} from "./billing-plans.js";
import { resellerService } from "./reseller.js";

export interface SubscriptionStatus {
  companyId: string;
  planId: BillingPlanId | null;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

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

function resolvePriceId(planId: BillingPlanId): string {
  const envKey = getPlanPriceEnvKey(planId);
  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(`${envKey} is not set — required to create a ${planId} subscription`);
  }
  return priceId;
}

export function billingService(db: Db) {
  const reseller = resellerService(db);

  async function getRow(companyId: string) {
    const [row] = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.companyId, companyId))
      .limit(1);
    return row ?? null;
  }

  async function getRowByCustomerId(customerId: string) {
    const [row] = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.stripeCustomerId, customerId))
      .limit(1);
    return row ?? null;
  }

  async function getRowBySubscriptionId(subscriptionId: string) {
    const [row] = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);
    return row ?? null;
  }

  async function getCompany(companyId: string) {
    const [row] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!row) throw notFound("Company not found");
    return row;
  }

  async function upsertRow(
    companyId: string,
    values: Partial<typeof billingSubscriptions.$inferInsert>,
  ) {
    const existing = await getRow(companyId);
    if (existing) {
      await db
        .update(billingSubscriptions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(billingSubscriptions.id, existing.id));
      return (await getRow(companyId))!;
    }
    await db.insert(billingSubscriptions).values({
      companyId,
      planId: values.planId ?? "starter",
      status: values.status ?? "incomplete",
      ...values,
    });
    return (await getRow(companyId))!;
  }

  async function createOrGetCustomer(
    companyId: string,
    companyName: string,
    ownerEmail: string,
  ): Promise<string> {
    const existing = await getRow(companyId);
    if (existing?.stripeCustomerId) {
      return existing.stripeCustomerId;
    }
    const stripe = getStripeClient();
    const customer = await stripe.customers.create({
      name: companyName,
      email: ownerEmail,
      metadata: { companyId },
    });
    await upsertRow(companyId, {
      stripeCustomerId: customer.id,
      planId: existing?.planId ?? "starter",
      status: existing?.status ?? "incomplete",
    });
    return customer.id;
  }

  async function createCheckoutSession(
    companyId: string,
    planId: BillingPlanId,
    successUrl: string,
    cancelUrl: string,
    ownerEmail?: string,
    referralPartnerCode?: string | null,
  ): Promise<{ url: string }> {
    if (!isBillingPlanId(planId)) {
      throw badRequest(`Unknown plan: ${planId}`);
    }
    const company = await getCompany(companyId);
    const customerId = await createOrGetCustomer(
      companyId,
      company.name,
      ownerEmail ?? `billing+${companyId}@paperclip.local`,
    );
    const priceId = resolvePriceId(planId);
    const stripe = getStripeClient();

    let clientLink = await reseller.getClientByCompanyId(companyId);
    if (!clientLink && referralPartnerCode) {
      try {
        const result = await reseller.attachClientByPartnerCode(
          companyId,
          referralPartnerCode,
        );
        if (result.attached) {
          clientLink = await reseller.getClientByCompanyId(companyId);
        }
      } catch (err) {
        logger.warn(
          { err, companyId, referralPartnerCode },
          "reseller: attachClientByPartnerCode failed",
        );
      }
    }
    let subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      trial_period_days: TRIAL_DAYS,
      metadata: { companyId, planId },
    };
    if (clientLink) {
      const partner = await reseller.getPartnerById(clientLink.resellerId);
      if (
        partner &&
        partner.stripeConnectAccountId &&
        partner.stripeConnectStatus === "active"
      ) {
        const planPriceCents = BILLING_PLANS[planId].price * 100;
        const commissionCents = Math.round(
          (planPriceCents * clientLink.commissionPercent) / 100,
        );
        // Destination-charge split: funds land on platform, then a transfer of
        // (total - application_fee) is sent to the partner's Connect account.
        // Commission = clientLink.commissionPercent (e.g. 20%); platform keeps
        // (100 - commission)% via application_fee_percent.
        const platformFeePercent = Math.max(0, 100 - clientLink.commissionPercent);
        subscriptionData = {
          ...subscriptionData,
          application_fee_percent: platformFeePercent,
          transfer_data: { destination: partner.stripeConnectAccountId },
          metadata: {
            ...subscriptionData.metadata,
            resellerId: partner.id,
            resellerCommissionPercent: String(clientLink.commissionPercent),
            resellerCommissionCents: String(commissionCents),
          },
        };
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: subscriptionData,
      metadata: { companyId, planId },
      allow_promotion_codes: true,
    });
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }
    await upsertRow(companyId, { planId, status: "incomplete" });
    return { url: session.url };
  }

  async function createBillingPortalSession(
    companyId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const row = await getRow(companyId);
    if (!row?.stripeCustomerId) {
      throw badRequest("No Stripe customer on file for this company");
    }
    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  async function getSubscriptionStatus(companyId: string): Promise<SubscriptionStatus> {
    const row = await getRow(companyId);
    if (!row) {
      return {
        companyId,
        planId: null,
        status: "none",
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      };
    }
    return {
      companyId,
      planId: isBillingPlanId(row.planId) ? row.planId : null,
      status: row.status,
      trialEndsAt: row.trialEndsAt ?? null,
      currentPeriodEnd: row.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      stripeCustomerId: row.stripeCustomerId ?? null,
      stripeSubscriptionId: row.stripeSubscriptionId ?? null,
    };
  }

  async function isSubscriptionActive(companyId: string): Promise<boolean> {
    const row = await getRow(companyId);
    if (!row) return false;
    return row.status === "active" || row.status === "trialing";
  }

  function planIdFromSubscription(subscription: Stripe.Subscription): BillingPlanId | null {
    const priceId = subscription.items.data[0]?.price?.id;
    if (!priceId) return null;
    for (const planId of Object.keys(BILLING_PLANS) as BillingPlanId[]) {
      const envKey = getPlanPriceEnvKey(planId);
      if (process.env[envKey] === priceId) return planId;
    }
    const metaPlan = subscription.metadata?.planId;
    return isBillingPlanId(metaPlan) ? metaPlan : null;
  }

  async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
    const companyId =
      subscription.metadata?.companyId ??
      (await (async () => {
        const row = await getRowBySubscriptionId(subscription.id);
        if (row) return row.companyId;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
        if (!customerId) return null;
        const byCustomer = await getRowByCustomerId(customerId);
        return byCustomer?.companyId ?? null;
      })());
    if (!companyId) {
      logger.warn({ subscriptionId: subscription.id }, "billing: cannot resolve company for subscription");
      return;
    }
    const planId = planIdFromSubscription(subscription) ?? "starter";
    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;
    const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
    await upsertRow(companyId, {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      planId,
      status: subscription.status,
      trialEndsAt,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    });
  }

  async function handleWebhookEvent(rawBody: Buffer | string, signature: string): Promise<{ received: true; type: string }> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    }
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(subscription);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(subscription);
          const amountPaid = invoice.amount_paid ?? 0;
          if (amountPaid > 0) {
            try {
              await reseller.markClientActiveBySubscription(subscriptionId);
            } catch (err) {
              logger.warn({ err, subscriptionId }, "reseller: markClientActiveBySubscription failed");
            }
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const existing = await getRowBySubscriptionId(subscriptionId);
          if (existing) {
            await db
              .update(billingSubscriptions)
              .set({ status: "past_due", updatedAt: new Date() })
              .where(eq(billingSubscriptions.id, existing.id));
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const existing = await getRowBySubscriptionId(subscription.id);
        if (existing) {
          await db
            .update(billingSubscriptions)
            .set({
              status: "canceled",
              cancelAtPeriodEnd: false,
              updatedAt: new Date(),
            })
            .where(eq(billingSubscriptions.id, existing.id));
        }
        break;
      }
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await reseller.updateStripeConnectStatus(
          account.id,
          account.details_submitted ?? false,
          account.charges_enabled ?? false,
          account.payouts_enabled ?? false,
        );
        break;
      }
      case "payment_intent.succeeded":
      case "charge.succeeded": {
        // Connect transfer is handled automatically by transfer_data on the
        // subscription. This branch is kept for observability only.
        logger.debug({ type: event.type }, "billing: Connect payment event received");
        break;
      }
      default:
        logger.debug({ type: event.type }, "billing: unhandled Stripe event");
    }

    return { received: true, type: event.type };
  }

  return {
    createOrGetCustomer,
    createCheckoutSession,
    createBillingPortalSession,
    handleWebhookEvent,
    getSubscriptionStatus,
    isSubscriptionActive,
  };
}

export type BillingService = ReturnType<typeof billingService>;
