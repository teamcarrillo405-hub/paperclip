import type { TaskTemplateName } from "./types.js";

export interface TaskTemplate {
  name: string;
  description: string;
  instructions: string;
}

export const TASK_TEMPLATES: Record<TaskTemplateName, TaskTemplate> = {
  "daily-operations": {
    name: "Daily Operations Briefing",
    description:
      "Reviews schedule, checks overdue invoices, generates morning briefing",
    instructions:
      "Review today's business operations: 1) Check for any invoices overdue more than 7 days and list them. 2) Summarize any pending approvals. 3) Check agent health status. 4) Generate a concise morning briefing report with action items.",
  },
  "weekly-reporting": {
    name: "Weekly Business Report",
    description: "Generates comprehensive weekly business performance report",
    instructions:
      "Generate a weekly business report covering: 1) Revenue and expense summary. 2) Top customers by activity this week. 3) Tasks completed by AI agents. 4) Any issues or Guardian alerts. 5) Three recommendations for next week.",
  },
  "customer-followup": {
    name: "Customer Follow-up Campaign",
    description: "Identifies and drafts follow-ups for inactive customers",
    instructions:
      "Review customer engagement: 1) Identify customers with no interaction in 30+ days. 2) For each, draft a personalized follow-up message. 3) Queue the drafts for human review before sending. 4) Summarize the outreach plan.",
  },
};

export const TASK_TEMPLATE_NAMES: TaskTemplateName[] = [
  "daily-operations",
  "weekly-reporting",
  "customer-followup",
];

export function isTaskTemplateName(value: string): value is TaskTemplateName {
  return (TASK_TEMPLATE_NAMES as string[]).includes(value);
}

export function renderTemplate(
  name: TaskTemplateName,
  variables?: Record<string, string>,
): string {
  const body = TASK_TEMPLATES[name].instructions;
  if (!variables) return body;
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = variables[key];
    return typeof v === "string" ? v : "";
  });
}
