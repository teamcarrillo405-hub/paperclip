import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "@/lib/router";
import { Check, Circle, ChevronRight, ChevronDown, HardHat, Hammer, UtensilsCrossed, ShoppingBag, Briefcase, HelpCircle, Mail, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import {
  onboardingApi,
  type OnboardingBusinessProfile,
} from "@/api/onboarding";
import { agentsApi } from "@/api/agents";
import { integrationsApi } from "@/api/integrations";
import { accessApi } from "@/api/access";
import {
  CONSTRUCTION_ROLES,
  CONSTRUCTION_DEPARTMENTS,
  type ConstructionRole,
} from "@/data/constructionRoles";
import { buildNewAgentRuntimeConfig } from "@/lib/new-agent-runtime-config";

const INDUSTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "contractor", label: "Contractor / Trades (HVAC, plumbing, electrical, landscaping)" },
  { value: "restaurant", label: "Restaurant / Food Service" },
  { value: "retail", label: "Retail Store" },
  { value: "professional_services", label: "Professional Services (consulting, legal, accounting)" },
  { value: "other", label: "Other" },
];

const REVENUE_OPTIONS: { value: string; label: string }[] = [
  { value: "under_500k", label: "Under $500K / year" },
  { value: "500k_2m", label: "$500K – $2M / year" },
  { value: "2m_10m", label: "$2M – $10M / year" },
  { value: "10m_20m", label: "$10M – $20M / year" },
];

const PAIN_POINT_OPTIONS: { value: string; label: string }[] = [
  { value: "not_enough_staff", label: "Not enough staff to get everything done" },
  { value: "manual_tasks", label: "Too many manual tasks eating up my day" },
  { value: "customer_followup", label: "Customer follow-up falls through the cracks" },
  { value: "cash_flow", label: "Cash flow & invoicing is a headache" },
  { value: "other", label: "Something else" },
];

const TEMPLATE_OPTIONS = [
  {
    id: "contractor-office",
    industryKey: "contractor",
    name: "Contractor Office",
    icon: "🔨",
    description:
      "For contractors, HVAC, plumbing, electrical, landscaping — handles jobs, estimates, invoices, and reviews.",
    agents: [
      { name: "Office Manager", description: "Runs the team and gives you a daily morning briefing." },
      { name: "Estimator", description: "Writes up estimates and drafts invoices in QuickBooks." },
      { name: "Scheduler", description: "Keeps the job schedule straight and reminds customers." },
      { name: "Accounts Receivable", description: "Chases unpaid invoices so you get paid on time." },
      { name: "Review Monitor", description: "Watches Google and Yelp and drafts responses to reviews." },
    ],
    routines: [
      "Daily job status briefing every morning",
      "Daily AR check for overdue invoices",
      "Weekly revenue report on Mondays",
    ],
  },
  {
    id: "restaurant-manager",
    industryKey: "restaurant",
    name: "Restaurant Manager",
    icon: "🍽️",
    description:
      "For restaurants, cafes, and food service — handles inventory, staffing, costs, and online reviews.",
    agents: [
      { name: "General Manager", description: "Coordinates the team and flags what needs your attention." },
      { name: "Inventory Manager", description: "Tracks stock and reorders before you run out." },
      { name: "Scheduler", description: "Builds weekly staff schedules." },
      { name: "Cost Analyst", description: "Watches food and labor costs vs. your targets." },
      { name: "Review Monitor", description: "Responds to Google and Yelp reviews." },
    ],
    routines: [
      "Daily sales briefing",
      "Weekly inventory reorder check",
      "Weekly labor cost report",
      "Review responses within 24 hours",
    ],
  },
  {
    id: "retail-store",
    industryKey: "retail",
    name: "Retail Store",
    icon: "🛍️",
    description:
      "For boutiques and specialty retail — handles inventory, sales analytics, loyalty, and reviews.",
    agents: [
      { name: "Store Manager", description: "Keeps the team aligned and flags the important stuff." },
      { name: "Inventory Manager", description: "Tracks stock and flags slow movers." },
      { name: "Sales Analyst", description: "Shows you which products sell best." },
      { name: "Loyalty Agent", description: "Keeps customers coming back with reminders and offers." },
      { name: "Review Monitor", description: "Responds to online reviews." },
    ],
    routines: [
      "Daily sales summary",
      "Weekly inventory reorder list",
      "Monthly loyalty campaign",
      "Review responses within 24 hours",
    ],
  },
  {
    id: "professional-services",
    industryKey: "professional_services",
    name: "Professional Services",
    icon: "💼",
    description:
      "For consultants, agencies, accountants, and law firms — client onboarding, billing, deadlines, and BD.",
    agents: [
      { name: "Practice Manager", description: "Runs the team and briefs you daily." },
      { name: "Client Onboarder", description: "Handles new-client intake and paperwork." },
      { name: "Billing Agent", description: "Sends invoices and chases payments." },
      { name: "Deadline Tracker", description: "Keeps filings and client deadlines on track." },
      { name: "Business Development", description: "Follows up on leads and referrals." },
    ],
    routines: [
      "Daily client work briefing",
      "Weekly billing run",
      "Deadline reminders",
      "Lead follow-up cadence",
      "Monthly pipeline report",
    ],
  },
];

const TOTAL_STEPS = 5;

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>
          Step {step} of {TOTAL_STEPS}
        </span>
        <span>{Math.round((step / TOTAL_STEPS) * 100)}% done</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SetupGuideChecklist — shown after the initial wizard is complete
// ---------------------------------------------------------------------------

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  cta?: React.ReactNode;
}

function SetupGuideChecklist({ companyId }: { companyId: string }) {
  const TOTAL_GUIDE_STEPS = 6;

  // Agent count
  const { data: agents } = useQuery({
    queryKey: ["agents", "list", companyId],
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
    retry: false,
  });

  // Integration status — check QuickBooks as proxy for "any integration"
  const { data: qbStatus } = useQuery({
    queryKey: ["integrations", "quickbooks", "status", companyId],
    queryFn: () => integrationsApi.quickbooks.getStatus(companyId),
    enabled: !!companyId,
    retry: false,
  });
  const { data: emailStatus } = useQuery({
    queryKey: ["integrations", "email", "status", companyId],
    queryFn: () => integrationsApi.email.getStatus(companyId),
    enabled: !!companyId,
    retry: false,
  });

  const integrationConnected =
    (qbStatus?.connected ?? false) ||
    (emailStatus?.gmail?.connected ?? false) ||
    (emailStatus?.outlook?.connected ?? false);

  // localStorage-backed items
  const [budgetSet, setBudgetSet] = useState(
    () => !!localStorage.getItem(`avero:setup:budget_set:${companyId}`),
  );
  const [invited, setInvited] = useState(
    () => !!localStorage.getItem(`avero:setup:invited:${companyId}`),
  );
  const [approvalReviewed, setApprovalReviewed] = useState(
    () => !!localStorage.getItem(`avero:setup:approval_reviewed:${companyId}`),
  );

  function markBudget() {
    localStorage.setItem(`avero:setup:budget_set:${companyId}`, "1");
    setBudgetSet(true);
  }
  function markInvited() {
    localStorage.setItem(`avero:setup:invited:${companyId}`, "1");
    setInvited(true);
  }
  function markApproval() {
    localStorage.setItem(`avero:setup:approval_reviewed:${companyId}`, "1");
    setApprovalReviewed(true);
  }

  const hasAgents = (agents?.length ?? 0) > 0;

  const items: ChecklistItem[] = [
    {
      id: "profile",
      title: "Create your business profile",
      description: "Your company name, industry, and revenue range are saved.",
      checked: true,
    },
    {
      id: "agent",
      title: "Create your first agent",
      description: "Agents handle recurring tasks so your team can focus on higher-value work.",
      checked: hasAgents,
      cta: !hasAgents ? (
        <Link to="/agents/new">
          <Button size="sm" variant="outline">Create agent</Button>
        </Link>
      ) : undefined,
    },
    {
      id: "integration",
      title: "Connect an integration",
      description: "Link QuickBooks, Gmail, or another service to unlock automated workflows.",
      checked: integrationConnected,
      cta: !integrationConnected ? (
        <Link to="/integrations">
          <Button size="sm" variant="outline">Connect</Button>
        </Link>
      ) : undefined,
    },
    {
      id: "budget",
      title: "Set a cost budget",
      description: "Cap how much AI spend is allowed per month so you stay in control.",
      checked: budgetSet,
      cta: !budgetSet ? (
        <div className="flex items-center gap-2">
          <Link to="/costs">
            <Button size="sm" variant="outline">Go to Costs</Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={markBudget}>Mark done</Button>
        </div>
      ) : undefined,
    },
    {
      id: "invite",
      title: "Invite a team member",
      description: "Bring your team in so they can collaborate on approvals and tasks.",
      checked: invited,
      cta: !invited ? (
        <div className="flex items-center gap-2">
          <Link to="/company/settings#members">
            <Button size="sm" variant="outline">Invite</Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={markInvited}>Mark done</Button>
        </div>
      ) : undefined,
    },
    {
      id: "approval",
      title: "Review your first approval",
      description: "Approve or reject an AI-generated action to see how the workflow operates.",
      checked: approvalReviewed,
      cta: !approvalReviewed ? (
        <div className="flex items-center gap-2">
          <Link to="/approvals">
            <Button size="sm" variant="outline">Go to Approvals</Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={markApproval}>Mark done</Button>
        </div>
      ) : undefined,
    },
  ];

  const completedCount = items.filter((i) => i.checked).length;

  return (
    <div className="mx-auto max-w-2xl py-10 px-4">
      {/* Header */}
      <h1 className="text-2xl font-semibold">Setup Guide</h1>
      <p className="mt-1 text-sm text-muted-foreground">Get the most out of Avero Paperclip</p>

      {/* Progress bar */}
      <div className="mt-6 mb-8">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>{completedCount} of {TOTAL_GUIDE_STEPS} steps complete</span>
          <span>{Math.round((completedCount / TOTAL_GUIDE_STEPS) * 100)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(completedCount / TOTAL_GUIDE_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-4 rounded-lg border border-border bg-card p-4",
              item.checked && "opacity-50",
            )}
          >
            <div className="mt-0.5 shrink-0">
              {item.checked ? (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </div>
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm", item.checked ? "line-through text-muted-foreground" : "font-semibold")}>
                {item.title}
              </p>
              {!item.checked && (
                <>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                  {item.cta && <div className="mt-3">{item.cta}</div>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OnboardingWizard — initial 5-step setup wizard
// ---------------------------------------------------------------------------

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ?? null;

  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [revenueRange, setRevenueRange] = useState("");
  const [painPoint, setPainPoint] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [roleOwners, setRoleOwners] = useState<Record<string, string>>({});
  const [roleOwnerIds, setRoleOwnerIds] = useState<Record<string, string>>({});

  function toggleRole(id: string) {
    setSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  function setRoleOwner(roleId: string, memberName: string, memberId: string) {
    setRoleOwners((prev) => ({ ...prev, [roleId]: memberName }));
    setRoleOwnerIds((prev) => ({ ...prev, [roleId]: memberId }));
  }

  const { data: status } = useQuery({
    queryKey: ["onboarding", "status", companyId],
    queryFn: () => onboardingApi.status(companyId!),
    enabled: !!companyId,
  });

  const { data: recommendation } = useQuery({
    queryKey: ["onboarding", "recommendation", companyId, industry],
    queryFn: () => onboardingApi.recommendation(companyId!),
    enabled: !!companyId && !!industry,
  });

  useEffect(() => {
    if (!status) return;
    const profile = status.businessProfile ?? {};
    if (profile.businessName && !businessName) setBusinessName(profile.businessName);
    if (profile.industry && !industry) setIndustry(profile.industry);
    if (profile.revenueRange && !revenueRange) setRevenueRange(profile.revenueRange);
    if (profile.biggestPainPoint && !painPoint) setPainPoint(profile.biggestPainPoint);
    if (profile.templateId && !selectedTemplateId) setSelectedTemplateId(profile.templateId);
    if (status.onboardingStep && status.onboardingStep > 0 && step === 1) {
      const resumeStep = Math.min(Math.max(status.onboardingStep, 1), TOTAL_STEPS);
      setStep(resumeStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (recommendation?.templateId && !selectedTemplateId) {
      setSelectedTemplateId(recommendation.templateId);
    }
  }, [recommendation, selectedTemplateId]);

  const saveStepMutation = useMutation({
    mutationFn: (body: { step: number; data?: Record<string, unknown> }) => {
      if (!companyId) throw new Error("No company selected");
      return onboardingApi.saveStep({ step: body.step, companyId, data: body.data });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error("No company selected");
      return onboardingApi.complete(companyId);
    },
  });

  const launchRolesMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company selected");
      const defaultRuntimeConfig = buildNewAgentRuntimeConfig();

      for (const roleId of selectedRoles) {
        const roleDef = CONSTRUCTION_ROLES.find((r) => r.id === roleId);
        if (!roleDef) continue;
        try {
          const result = await agentsApi.hire(companyId, {
            name: roleDef.title,
            title: roleDef.title,
            role: "general",
            adapterType: "claude_local",
            adapterConfig: {
              promptTemplate: roleDef.systemPrompt,
              dangerouslySkipPermissions: true,
            },
            runtimeConfig: defaultRuntimeConfig,
            budgetMonthlyCents: 0,
          });
          // Pause immediately — agents start inactive
          if (result.agent?.id) {
            await agentsApi.pause(result.agent.id, companyId);
          }
        } catch {
          // Partial failure: continue creating remaining agents
        }
      }
      await onboardingApi.complete(companyId);
    },
  });

  function persistStep(nextStep: number, data?: Record<string, unknown>) {
    if (!companyId) return;
    saveStepMutation.mutate({ step: nextStep, data });
  }

  function goTo(nextStep: number, data?: Record<string, unknown>) {
    setStep(nextStep);
    persistStep(nextStep, data);
  }

  const recommendedTemplateId = recommendation?.templateId ?? null;

  const selectedTemplate = useMemo(
    () => TEMPLATE_OPTIONS.find((t) => t.id === selectedTemplateId) ?? null,
    [selectedTemplateId],
  );

  if (!companyId || !selectedCompany) {
    return (
      <div className="mx-auto max-w-2xl py-16 px-4">
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Pick a company first</h1>
            <p className="text-sm text-muted-foreground">
              Select a company from the switcher to start the setup guide.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Once the wizard is complete, show the post-wizard Setup Guide checklist
  if (status?.onboardingCompleted === true) {
    return <SetupGuideChecklist companyId={companyId} />;
  }

  return (
    <div className="mx-auto max-w-3xl py-10 px-4">
      <StepIndicator step={step} />

      {step === 1 && (
        <Step1
          businessName={businessName}
          setBusinessName={setBusinessName}
          industry={industry}
          setIndustry={setIndustry}
          revenueRange={revenueRange}
          setRevenueRange={setRevenueRange}
          painPoint={painPoint}
          setPainPoint={setPainPoint}
          onNext={() => {
            const profile: OnboardingBusinessProfile = {
              businessName: businessName.trim() || undefined,
              industry: industry || undefined,
              revenueRange: revenueRange || undefined,
              biggestPainPoint: painPoint || undefined,
            };
            goTo(2, { businessProfile: profile });
          }}
        />
      )}

      {step === 2 && (
        <Step2
          onNext={() => goTo(3)}
          onSkip={() => goTo(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && industry === "contractor" && (
        <StepRoles
          selectedIds={selectedRoles}
          onToggle={toggleRole}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}

      {step === 3 && industry !== "contractor" && (
        <Step3
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          recommendedTemplateId={recommendedTemplateId}
          onNext={() => {
            if (!selectedTemplateId) return;
            goTo(4, { templateId: selectedTemplateId });
          }}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && industry === "contractor" && (
        <StepRolesReview
          selectedIds={selectedRoles}
          roleOwners={roleOwners}
          roleOwnerIds={roleOwnerIds}
          onOwnerChange={setRoleOwner}
          onNext={async () => {
            try {
              await launchRolesMutation.mutateAsync();
              setStep(5);
            } catch {
              // error shown via errorMessage prop
            }
          }}
          onBack={() => setStep(3)}
          launching={launchRolesMutation.isPending}
          errorMessage={launchRolesMutation.isError ? "Something went wrong creating your agents. Please try again." : undefined}
        />
      )}

      {step === 4 && industry !== "contractor" && selectedTemplate && (
        <Step4
          template={selectedTemplate}
          onNext={() => goTo(5, { templateId: selectedTemplate.id })}
          onBack={() => setStep(3)}
          onLaunch={async () => {
            await completeMutation.mutateAsync();
            setStep(5);
          }}
          launching={completeMutation.isPending}
        />
      )}

      {step === 4 && industry !== "contractor" && !selectedTemplate && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-4">No template selected.</p>
          <Button variant="ghost" onClick={() => setStep(3)}>← Back</Button>
        </div>
      )}

      {step === 5 && industry === "contractor" && (
        <StepContractorDone
          roleCount={selectedRoles.length}
          onGoToDashboard={() => navigate("/dashboard")}
        />
      )}

      {step === 5 && industry !== "contractor" && selectedTemplate && (
        <Step5
          template={selectedTemplate}
          onGoToDashboard={() => navigate("/dashboard")}
        />
      )}

      {step === 5 && industry !== "contractor" && !selectedTemplate && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-4">Something went wrong. Please start over.</p>
          <Button variant="ghost" onClick={() => setStep(1)}>Start over</Button>
        </div>
      )}
    </div>
  );
}

function Step1(props: {
  businessName: string;
  setBusinessName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  revenueRange: string;
  setRevenueRange: (v: string) => void;
  painPoint: string;
  setPainPoint: (v: string) => void;
  onNext: () => void;
}) {
  const {
    businessName,
    setBusinessName,
    industry,
    setIndustry,
    revenueRange,
    setRevenueRange,
    painPoint,
    setPainPoint,
    onNext,
  } = props;

  const [nameError, setNameError] = useState<string | null>(null);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function validateName(value: string) {
    if (value.length === 0) { setNameError(null); return; }
    if (value.trim().length < 3) { setNameError("Name must be at least 3 characters"); return; }
    if (!/^[a-zA-Z0-9 _&.',\-]+$/.test(value)) { setNameError("No special characters allowed"); return; }
    setNameError(null);
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setBusinessName(v);
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(() => validateName(v), 300);
  }

  useEffect(() => {
    return () => {
      if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    };
  }, []);

  const ready = businessName.trim().length > 0 && !!industry && !!revenueRange && !!painPoint;
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Tell us about your business</h1>
      <p className="text-sm text-muted-foreground mb-6">
        This helps us pick the right AI agents for you. Takes about 30 seconds.
      </p>
      <div className="space-y-5">
        <div>
          <Label htmlFor="businessName">What's your business name?</Label>
          <Input
            id="businessName"
            className={cn("mt-1", nameError && "border-red-500 focus-visible:ring-red-500")}
            placeholder="Acme Plumbing"
            value={businessName}
            onChange={handleNameChange}
          />
          {nameError && (
            <p className="mt-1 text-xs text-red-500">{nameError}</p>
          )}
        </div>
        <div>
          <Label htmlFor="industry">What kind of business is it?</Label>
          <select
            id="industry"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            <option value="">Pick one…</option>
            {INDUSTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="revenue">About how much does your business make per year?</Label>
          <select
            id="revenue"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={revenueRange}
            onChange={(e) => setRevenueRange(e.target.value)}
          >
            <option value="">Pick a range…</option>
            {REVENUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="painPoint">What's the biggest headache for you right now?</Label>
          <select
            id="painPoint"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={painPoint}
            onChange={(e) => setPainPoint(e.target.value)}
          >
            <option value="">Pick one…</option>
            {PAIN_POINT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-8 flex justify-end">
        <Button onClick={onNext} disabled={!ready}>
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Step2(props: { onNext: () => void; onSkip: () => void; onBack: () => void }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Connect your tools</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Connecting these lets your AI agents actually do the work. You can also skip this and do it later.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-md bg-[#2CA01C]/10 flex items-center justify-center">
                <Plug className="h-5 w-5 text-[#2CA01C]" />
              </div>
              <div>
                <div className="font-medium">QuickBooks</div>
                <div className="text-xs text-muted-foreground">Invoices, customers, and payments</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Your AI agents can read invoices, chase unpaid bills, and draft new ones.
            </p>
            <Button variant="outline" asChild>
              <a href="/settings/integrations">Connect QuickBooks</a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-md bg-blue-500/10 flex items-center justify-center">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="font-medium">Email (Gmail or Outlook)</div>
                <div className="text-xs text-muted-foreground">Customer follow-ups and replies</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Let agents send reminders, follow-ups, and responses on your behalf.
            </p>
            <Button variant="outline" asChild>
              <a href="/settings/integrations">Connect Email</a>
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={props.onBack}>
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground underline"
            onClick={props.onSkip}
          >
            Skip for now →
          </button>
          <Button onClick={props.onNext}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step3(props: {
  selectedTemplateId: string | null;
  setSelectedTemplateId: (v: string) => void;
  recommendedTemplateId: string | null;
  onNext: () => void;
  onBack: () => void;
}) {
  const { selectedTemplateId, setSelectedTemplateId, recommendedTemplateId, onNext, onBack } = props;
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Pick your first AI agent team</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Pick the one that sounds closest to your business. You can add more agents later.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {TEMPLATE_OPTIONS.map((template) => {
          const selected = selectedTemplateId === template.id;
          const recommended = recommendedTemplateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelectedTemplateId(template.id)}
              className={`relative text-left rounded-lg border p-5 transition-colors ${
                selected
                  ? "border-primary ring-2 ring-primary/30 bg-accent/30"
                  : "border-border hover:border-primary/50 hover:bg-accent/20"
              }`}
            >
              {recommended && (
                <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Recommended ⭐
                </span>
              )}
              <div className="flex items-center gap-3 mb-2">
                <TemplateIcon id={template.id} />
                <div className="font-semibold">{template.name}</div>
              </div>
              <p className="text-sm text-muted-foreground">{template.description}</p>
              <div className="mt-3 text-xs text-muted-foreground">
                {template.agents.length} agents · {template.routines.length} routines
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onNext} disabled={!selectedTemplateId}>
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const BY_DEPT = CONSTRUCTION_DEPARTMENTS.map((dept) => ({
  dept,
  roles: CONSTRUCTION_ROLES.filter((r) => r.department === dept),
}));

function StepRoles(props: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { selectedIds, onToggle, onNext, onBack } = props;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <HardHat className="h-6 w-6 text-amber-600 shrink-0" />
        <h1 className="text-2xl font-semibold">Build your construction team</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Check the roles your company needs. Each one becomes a paused AI agent ready for you to activate — no agents start working until you say so.
      </p>

      <div className="space-y-6 max-h-[420px] overflow-y-auto pr-1 scrollbar-auto-hide">
        {BY_DEPT.map(({ dept, roles }) => (
          <div key={dept}>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 font-mono mb-2 px-1">
              {dept}
            </div>
            <div className="space-y-2">
              {roles.map((role) => {
                const selected = selectedIds.includes(role.id);
                const expanded = expandedId === role.id;
                return (
                  <div
                    key={role.id}
                    className={cn(
                      "rounded-lg border transition-colors",
                      selected
                        ? "border-primary bg-accent/20"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-start gap-3 p-4">
                      <input
                        type="checkbox"
                        id={`role-${role.id}`}
                        checked={selected}
                        onChange={() => onToggle(role.id)}
                        className="mt-0.5 h-4 w-4 accent-primary shrink-0 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor={`role-${role.id}`}
                            className="cursor-pointer text-sm font-semibold"
                          >
                            {role.title}
                          </label>
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : role.id)}
                            className="shrink-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            aria-label={expanded ? `Collapse ${role.title}` : `Expand ${role.title}`}
                          >
                            {expanded ? "Less" : "More"}
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 transition-transform",
                                expanded && "rotate-180",
                              )}
                            />
                          </button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                          {expanded ? role.fullDescription : role.description}
                        </p>
                        {expanded && role.suggestedIntegrations.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            <span className="font-medium">Suggested integrations: </span>
                            {role.suggestedIntegrations.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {selectedIds.length === 0
              ? "No roles selected"
              : `${selectedIds.length} role${selectedIds.length === 1 ? "" : "s"} selected`}
          </span>
          <Button onClick={onNext} disabled={selectedIds.length === 0}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepRolesReview(props: {
  selectedIds: string[];
  roleOwners: Record<string, string>;
  roleOwnerIds: Record<string, string>;
  onOwnerChange: (roleId: string, memberName: string, memberId: string) => void;
  onNext: () => void;
  onBack: () => void;
  launching: boolean;
  errorMessage?: string;
}) {
  const { selectedIds, roleOwners, roleOwnerIds, onOwnerChange, onNext, onBack, launching, errorMessage } = props;
  const { selectedCompanyId } = useCompany();

  const { data: membersData } = useQuery({
    queryKey: ["company", selectedCompanyId, "members"],
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const members = membersData?.members ?? [];

  const selectedRoles = useMemo(
    () =>
      selectedIds
        .map((id) => CONSTRUCTION_ROLES.find((r) => r.id === id))
        .filter((r): r is ConstructionRole => !!r),
    [selectedIds],
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Review your construction team</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Agents will be created in <strong>paused state</strong> — they won't take any actions until you activate them from the Agents page. Optionally assign a team member to supervise each role.
      </p>

      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-auto-hide mb-6">
        {selectedRoles.map((role) => (
          <div
            key={role.id}
            className="flex items-start gap-4 rounded-lg border border-border bg-card p-4"
          >
            <Check className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold">{role.title}</p>
                  <p className="text-xs text-muted-foreground">{role.department}</p>
                </div>
                {members.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <label
                      htmlFor={`owner-${role.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Supervised by:
                    </label>
                    <select
                      id={`owner-${role.id}`}
                      name={`owner-${role.id}`}
                      className="text-xs rounded-md border border-input bg-background px-2 py-1"
                      value={roleOwnerIds[role.id] ?? ""}
                      onChange={(e) => {
                        const selected = members.find((m) => m.principalId === e.target.value);
                        if (selected) {
                          onOwnerChange(
                            role.id,
                            selected.user?.name ?? selected.user?.email ?? selected.principalId,
                            selected.principalId,
                          );
                        } else {
                          // empty string = clear owner assignment
                          onOwnerChange(role.id, "", "");
                        }
                      }}
                    >
                      <option value="">— Unassigned —</option>
                      {members.map((m) => (
                        <option key={m.principalId} value={m.principalId}>
                          {m.user?.name ?? m.user?.email ?? m.principalId}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1 leading-snug">{role.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-3 mb-6">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>{selectedIds.length} agent{selectedIds.length === 1 ? "" : "s"}</strong> will be created in paused state. Go to <strong>Agents</strong> after setup to review and activate each one.
        </p>
      </div>

      {errorMessage && (
        <p className="mb-4 text-sm text-destructive">{errorMessage}</p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <Button onClick={onNext} disabled={launching}>
          {launching ? "Creating agents…" : `Create ${selectedIds.length} agent${selectedIds.length === 1 ? "" : "s"} →`}
        </Button>
      </div>
    </div>
  );
}

function TemplateIcon({ id }: { id: string }) {
  if (id === "contractor-office") return <Hammer className="h-6 w-6 text-amber-600" />;
  if (id === "restaurant-manager") return <UtensilsCrossed className="h-6 w-6 text-orange-600" />;
  if (id === "retail-store") return <ShoppingBag className="h-6 w-6 text-pink-600" />;
  if (id === "professional-services") return <Briefcase className="h-6 w-6 text-indigo-600" />;
  return <HelpCircle className="h-6 w-6 text-muted-foreground" />;
}

function Step4(props: {
  template: (typeof TEMPLATE_OPTIONS)[number];
  onNext: () => void;
  onBack: () => void;
  onLaunch: () => void;
  launching: boolean;
}) {
  const { template, onBack, onLaunch, launching } = props;
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Review your agent team</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Here's what your AI team will look like. You can always tweak it later.
      </p>

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <TemplateIcon id={template.id} />
            <div>
              <div className="font-semibold">{template.name}</div>
              <div className="text-xs text-muted-foreground">{template.description}</div>
            </div>
          </div>
          <div className="mb-4">
            <div className="text-sm font-medium mb-2">Your agents:</div>
            <ul className="space-y-2">
              {template.agents.map((agent) => (
                <li key={agent.name} className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">{agent.name}</div>
                    <div className="text-sm text-muted-foreground">{agent.description}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">What they'll do on a regular schedule:</div>
            <ul className="space-y-1">
              {template.routines.map((routine) => (
                <li key={routine} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-primary">•</span>
                  <span>{routine}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onLaunch} disabled={launching}>
          {launching ? "Launching…" : "Looks good, let's launch! →"}
        </Button>
      </div>
    </div>
  );
}

function Step5(props: {
  template: (typeof TEMPLATE_OPTIONS)[number];
  onGoToDashboard: () => void;
}) {
  const { template, onGoToDashboard } = props;
  return (
    <div className="text-center">
      <style>{`
        @keyframes rocket-launch {
          0% { transform: translateY(40px) rotate(-8deg); opacity: 0; }
          30% { transform: translateY(0) rotate(-4deg); opacity: 1; }
          60% { transform: translateY(-8px) rotate(0deg); }
          100% { transform: translateY(-16px) rotate(2deg); }
        }
        @keyframes rocket-smoke {
          0% { transform: scale(0.2); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes rocket-flame {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.3); }
        }
        .rocket-wrap { position: relative; height: 160px; display: flex; align-items: flex-end; justify-content: center; }
        .rocket { font-size: 72px; line-height: 1; animation: rocket-launch 1.6s ease-out forwards; }
        .rocket-flame {
          position: absolute;
          bottom: 8px;
          width: 18px;
          height: 34px;
          background: linear-gradient(to top, #ffb800, #ff5a00 70%, transparent);
          border-radius: 50% 50% 40% 40% / 40% 40% 60% 60%;
          filter: blur(1px);
          animation: rocket-flame 0.25s ease-in-out infinite;
        }
        .rocket-smoke {
          position: absolute;
          bottom: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(148, 163, 184, 0.6);
          animation: rocket-smoke 1.2s ease-out forwards;
        }
      `}</style>
      <div className="rocket-wrap mb-4">
        <span className="rocket" role="img" aria-label="rocket">🚀</span>
        <span className="rocket-flame" />
        <span className="rocket-smoke" style={{ left: "calc(50% - 30px)" }} />
        <span className="rocket-smoke" style={{ left: "calc(50% + 6px)", animationDelay: "0.2s" }} />
      </div>
      <h1 className="text-3xl font-semibold mb-2">You're live! 🎉</h1>
      <p className="text-muted-foreground mb-6">
        Your AI agents are active and ready to get to work.
      </p>

      <Card className="text-left mb-6">
        <CardContent className="p-5">
          <div className="text-sm font-medium mb-3">Here's what your team will do today:</div>
          <ul className="space-y-2">
            {template.agents.map((agent) => (
              <li key={agent.name} className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                <div>
                  <span className="text-sm font-medium">{agent.name}</span>
                  <span className="text-sm text-muted-foreground"> — {agent.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Button size="lg" onClick={onGoToDashboard}>
        Go to Dashboard →
      </Button>
    </div>
  );
}

function StepContractorDone(props: {
  roleCount: number;
  onGoToDashboard: () => void;
}) {
  const { roleCount, onGoToDashboard } = props;
  return (
    <div className="text-center">
      <div className="flex items-center justify-center mb-6">
        <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <HardHat className="h-10 w-10 text-amber-600" />
        </div>
      </div>
      <h1 className="text-2xl font-semibold mb-2">Your team is ready</h1>
      <p className="text-muted-foreground mb-2">
        {roleCount} agent{roleCount === 1 ? " has" : "s have"} been created and are waiting for you.
      </p>
      <p className="text-sm text-muted-foreground mb-8">
        Go to <strong>Agents</strong> to review each one and activate the roles you want to start working.
      </p>
      <Button size="lg" onClick={onGoToDashboard}>
        Go to Dashboard →
      </Button>
    </div>
  );
}
