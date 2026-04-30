import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { Check, ChevronRight, Hammer, UtensilsCrossed, ShoppingBag, Briefcase, HelpCircle, Mail, Plug } from "lucide-react";
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

      {step === 3 && (
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

      {step === 4 && selectedTemplate && (
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

      {step === 5 && selectedTemplate && (
        <Step5
          template={selectedTemplate}
          onGoToDashboard={() => navigate("/dashboard")}
        />
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
