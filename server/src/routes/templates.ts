import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";
import { companyPortabilityService, goalService } from "../services/index.js";
import type { StorageService } from "../storage/types.js";
import { assertCompanyAccess } from "./authz.js";
import { INDUSTRY_TEMPLATES, type IndustryTemplate } from "../templates/index.js";

function templateSummary(tpl: IndustryTemplate) {
  return {
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    industry: tpl.industry,
    icon: tpl.icon,
    agentCount: tpl.agentCount,
    routineCount: tpl.routineCount,
  };
}

function findTemplate(id: string): IndustryTemplate | undefined {
  return INDUSTRY_TEMPLATES.find((entry) => entry.id === id);
}

function mapGoalLevel(level: string): "company" | "team" | "agent" | "task" {
  if (level === "company" || level === "team" || level === "agent" || level === "task") {
    return level;
  }
  return "company";
}

export function templateRoutes(db: Db, storage?: StorageService) {
  const router = Router();
  const portability = companyPortabilityService(db, storage);
  const goals = goalService(db);

  router.get("/templates", (_req, res) => {
    res.json({
      templates: INDUSTRY_TEMPLATES.map(templateSummary),
    });
  });

  router.get("/templates/:id", (req, res) => {
    const tpl = findTemplate(req.params.id as string);
    if (!tpl) {
      throw notFound(`Template ${req.params.id} not found`);
    }
    res.json({
      ...templateSummary(tpl),
      manifest: tpl.file.manifest,
      files: tpl.file.files,
      goals: tpl.file.goals ?? [],
      starterIssues: tpl.file.starterIssues ?? [],
    });
  });

  router.post("/templates/:id/apply", async (req, res) => {
    const tpl = findTemplate(req.params.id as string);
    if (!tpl) {
      throw notFound(`Template ${req.params.id} not found`);
    }
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
    if (!companyId) {
      throw badRequest("companyId query parameter is required");
    }
    assertCompanyAccess(req, companyId);

    const actorUserId = req.actor.type === "board" ? req.actor.userId : null;

    const importResult = await portability.importBundle(
      {
        source: { type: "inline", files: tpl.file.files },
        target: { mode: "existing_company", companyId },
        include: { company: false, agents: true, projects: true, issues: true, skills: false },
        agents: "all",
        collisionStrategy: "skip",
      },
      actorUserId,
    );

    const createdGoals: Array<{ id: string; title: string }> = [];
    for (const goal of tpl.file.goals ?? []) {
      const created = await goals.create(companyId, {
        title: goal.title,
        description: goal.description ?? null,
        level: mapGoalLevel(goal.level),
      });
      if (created) {
        createdGoals.push({ id: created.id, title: created.title });
      }
    }

    res.json({
      templateId: tpl.id,
      company: importResult.company,
      agents: importResult.agents,
      projects: importResult.projects,
      goals: createdGoals,
      warnings: importResult.warnings,
    });
  });

  return router;
}
