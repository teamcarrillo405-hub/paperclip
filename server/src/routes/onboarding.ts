import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { businessProfileSchema, type BusinessProfile } from "@paperclipai/shared";
import { eq } from "drizzle-orm";
import { badRequest, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { companyService } from "../services/index.js";
import { assertCompanyAccess } from "./authz.js";
import { INDUSTRY_TEMPLATES } from "../templates/index.js";
import { logger } from "../middleware/logger.js";

async function sendWelcomeEmailForCompany(
  _db: Db,
  companyId: string,
  company: { name?: string | null; contactEmail?: string | null } | null,
): Promise<void> {
  const to = company?.contactEmail ?? process.env.POSTAL_DEFAULT_TO;
  if (!to) return;
  try {
    const { AveroPostalService } = await import("@paperclipai/plugin-postal");
    const service = new AveroPostalService({ logger });
    await service.sendTemplate(
      "welcome",
      to,
      {
        companyName: company?.name ?? "your business",
        dashboardUrl: process.env.APP_URL ?? "/",
      },
      companyId,
    );
  } catch (err) {
    logger.warn({ err }, "onboarding: welcome email send failed");
  }
}

const stepPayloadSchema = z.object({
  step: z.number().int().min(0).max(10),
  data: z
    .object({
      businessProfile: businessProfileSchema.optional(),
      templateId: z.string().max(100).optional(),
      selectedAgents: z.array(z.string()).optional(),
      selectedRoutines: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
});

const INDUSTRY_TEMPLATE_MAP: Record<string, string> = {
  contractor: "contractor-office",
  restaurant: "restaurant-manager",
  retail: "retail-store",
  professional_services: "professional-services",
  "Food & Beverage": "restaurant-manager",
  "Restaurant": "restaurant-manager",
  "Cafe": "restaurant-manager",
  "Retail": "retail-store",
  "Boutique": "retail-store",
  "Field Services": "contractor-office",
  "Contracting": "contractor-office",
  "HVAC": "contractor-office",
  "Plumbing": "contractor-office",
  "Electrical": "contractor-office",
  "Landscaping": "contractor-office",
  "Professional Services": "professional-services",
  "Consulting": "professional-services",
  "Legal": "professional-services",
  "Accounting": "professional-services",
};

function recommendTemplate(profile: BusinessProfile | null | undefined): string {
  if (!profile?.industry) return "contractor-office";
  const exact = INDUSTRY_TEMPLATE_MAP[profile.industry];
  if (exact) return exact;
  const lower = profile.industry.toLowerCase();
  for (const [key, id] of Object.entries(INDUSTRY_TEMPLATE_MAP)) {
    if (lower.includes(key.toLowerCase())) return id;
  }
  return "contractor-office";
}

export function onboardingRoutes(db: Db) {
  const router = Router();
  const svc = companyService(db);

  function resolveCompanyId(req: { query: Record<string, unknown>; body?: unknown }): string {
    const fromQuery = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const body = (req.body ?? {}) as { companyId?: unknown };
    const fromBody = typeof body.companyId === "string" ? body.companyId : undefined;
    const companyId = fromQuery ?? fromBody;
    if (!companyId) {
      throw badRequest("companyId is required");
    }
    return companyId;
  }

  router.get("/onboarding/status", async (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);
    const company = await svc.getById(companyId);
    if (!company) throw notFound(`Company ${companyId} not found`);
    res.json({
      companyId: company.id,
      onboardingCompleted: company.onboardingCompleted,
      onboardingStep: company.onboardingStep,
      businessProfile: company.businessProfile ?? null,
    });
  });

  router.post("/onboarding/step", validate(stepPayloadSchema), async (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);
    const { step, data } = req.body as z.infer<typeof stepPayloadSchema>;

    const existing = await svc.getById(companyId);
    if (!existing) throw notFound(`Company ${companyId} not found`);

    const patch: Partial<typeof companies.$inferInsert> = {
      onboardingStep: step,
    };

    if (data?.businessProfile) {
      const merged: BusinessProfile = {
        ...(existing.businessProfile ?? {}),
        ...data.businessProfile,
      };
      patch.businessProfile = merged;
    } else if (data?.templateId) {
      const merged: BusinessProfile = {
        ...(existing.businessProfile ?? {}),
        templateId: data.templateId,
      };
      patch.businessProfile = merged;
    }

    await db
      .update(companies)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    const updated = await svc.getById(companyId);
    res.json({
      companyId,
      onboardingStep: updated?.onboardingStep ?? step,
      onboardingCompleted: updated?.onboardingCompleted ?? false,
      businessProfile: updated?.businessProfile ?? null,
    });
  });

  router.post("/onboarding/complete", async (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);
    const existing = await svc.getById(companyId);
    if (!existing) throw notFound(`Company ${companyId} not found`);

    await db
      .update(companies)
      .set({
        onboardingCompleted: true,
        onboardingStep: 5,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    // Best-effort welcome email on onboarding completion. Fires only when a
    // recipient is resolvable; never blocks completion on send failure.
    void sendWelcomeEmailForCompany(db, companyId, existing).catch(() => undefined);

    res.json({ companyId, onboardingCompleted: true });
  });

  router.get("/onboarding/recommendation", async (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);
    const existing = await svc.getById(companyId);
    if (!existing) throw notFound(`Company ${companyId} not found`);
    const templateId = recommendTemplate(existing.businessProfile);
    const template = INDUSTRY_TEMPLATES.find((entry) => entry.id === templateId);
    res.json({
      templateId,
      template: template
        ? {
            id: template.id,
            name: template.name,
            description: template.description,
            industry: template.industry,
            icon: template.icon,
            agentCount: template.agentCount,
            routineCount: template.routineCount,
          }
        : null,
    });
  });

  return router;
}
