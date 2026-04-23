import restaurantManager from "./restaurant-manager.json" with { type: "json" };
import retailStore from "./retail-store.json" with { type: "json" };
import contractorOffice from "./contractor-office.json" with { type: "json" };
import professionalServices from "./professional-services.json" with { type: "json" };
import bookkeeper from "./bookkeeper.json" with { type: "json" };

export interface IndustryTemplateGoal {
  title: string;
  level: string;
  description?: string | null;
}

export interface IndustryTemplateStarterIssue {
  slug: string;
  title: string;
  priority: string;
  description: string;
}

export interface IndustryTemplateFile {
  manifest: Record<string, unknown>;
  files: Record<string, string>;
  goals?: IndustryTemplateGoal[];
  starterIssues?: IndustryTemplateStarterIssue[];
}

export interface IndustryTemplate {
  id: string;
  name: string;
  description: string;
  industry: string;
  icon: string;
  agentCount: number;
  routineCount: number;
  file: IndustryTemplateFile;
}

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: "restaurant-manager",
    name: "Restaurant Manager",
    description:
      "For restaurants, cafes, and food service businesses — manage inventory, staffing, costs, and online reputation with AI.",
    industry: "Food & Beverage",
    icon: "🍽️",
    agentCount: 5,
    routineCount: 4,
    file: restaurantManager as IndustryTemplateFile,
  },
  {
    id: "retail-store",
    name: "Retail Store",
    description:
      "For boutiques, specialty retail, and stores — manage inventory, sales analytics, customer loyalty, and reviews with AI.",
    industry: "Retail",
    icon: "🛍️",
    agentCount: 5,
    routineCount: 4,
    file: retailStore as IndustryTemplateFile,
  },
  {
    id: "contractor-office",
    name: "Contractor Office",
    description:
      "For contractors, HVAC, plumbing, electrical, landscaping — manage jobs, estimates, invoices, and reviews with AI.",
    industry: "Field Services",
    icon: "🔨",
    agentCount: 5,
    routineCount: 3,
    file: contractorOffice as IndustryTemplateFile,
  },
  {
    id: "professional-services",
    name: "Professional Services",
    description:
      "For consultants, agencies, accountants, and law firms — automate client onboarding, billing, deadlines, and business development.",
    industry: "Professional Services",
    icon: "💼",
    agentCount: 5,
    routineCount: 5,
    file: professionalServices as IndustryTemplateFile,
  },
  {
    id: "bookkeeper",
    name: "AI Bookkeeper",
    description:
      "Monitors your finances, sends daily briefings, and chases overdue invoices — powered by your QuickBooks data.",
    industry: "Finance",
    icon: "💰",
    agentCount: 4,
    routineCount: 4,
    file: bookkeeper as IndustryTemplateFile,
  },
];
