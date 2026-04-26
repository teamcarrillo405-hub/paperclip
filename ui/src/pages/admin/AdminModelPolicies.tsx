import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Save } from "lucide-react";
import { adminApi, type ModelPolicies } from "@/api/admin";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KNOWN_MODELS = [
  "claude-3-5-sonnet",
  "claude-3-5-haiku",
  "claude-3-opus",
  "claude-sonnet-4-5",
  "claude-opus-4",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
];

function ModelCheckboxList({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (models: string[]) => void;
}) {
  const toggle = (model: string) => {
    if (selected.includes(model)) {
      onChange(selected.filter((m) => m !== model));
    } else {
      onChange([...selected, model]);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {KNOWN_MODELS.map((model) => {
        const checked = selected.includes(model);
        return (
          <label
            key={model}
            className={[
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
              checked
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:bg-accent/30",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(model)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm font-mono">{model}</span>
          </label>
        );
      })}
    </div>
  );
}

function CompanyOverrideRow({
  companyId,
  allowedModels,
  onChange,
  onRemove,
}: {
  companyId: string;
  allowedModels: string[];
  onChange: (companyId: string, models: string[]) => void;
  onRemove: (companyId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <Input
            value={companyId}
            readOnly
            className="font-mono text-xs h-8"
          />
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {expanded ? "Collapse" : `${allowedModels.length} model(s)`}
        </button>
        <button
          type="button"
          onClick={() => onRemove(companyId)}
          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
          aria-label="Remove override"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {expanded && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Allowed models (empty = use global):</p>
          <ModelCheckboxList
            selected={allowedModels}
            onChange={(models) => onChange(companyId, models)}
          />
        </div>
      )}
    </div>
  );
}

export function AdminModelPolicies() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [policies, setPolicies] = useState<ModelPolicies>({
    allowedModels: [],
    maxBudgetPerAgentMonthly: 0,
    requireApprovalAbove: 0,
    restrictedCompanies: [],
  });
  const [newCompanyId, setNewCompanyId] = useState("");

  useEffect(() => {
    setBreadcrumbs([
      { label: "Enterprise Admin", href: "/admin" },
      { label: "Model Policies" },
    ]);
  }, [setBreadcrumbs]);

  const { isLoading, error, data: loadedPolicies } = useQuery({
    queryKey: ["admin", "model-policies"],
    queryFn: () => adminApi.getModelPolicies(),
  });

  // Sync loaded policies into state once
  const [synced, setSynced] = useState(false);
  if (loadedPolicies && !synced) {
    setPolicies(loadedPolicies);
    setSynced(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => adminApi.saveModelPolicies(policies),
    onSuccess: () => {
      pushToast({ title: "Model policies saved", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["admin", "model-policies"] });
    },
    onError: (err) => {
      pushToast({
        title: "Failed to save policies",
        body: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    },
  });

  const addCompanyOverride = () => {
    const id = newCompanyId.trim();
    if (!id) return;
    if (policies.restrictedCompanies.some((c) => c.companyId === id)) {
      pushToast({ title: "Company already has an override", tone: "warn" });
      return;
    }
    setPolicies((p) => ({
      ...p,
      restrictedCompanies: [...p.restrictedCompanies, { companyId: id, allowedModels: [] }],
    }));
    setNewCompanyId("");
  };

  const updateCompanyOverride = (companyId: string, models: string[]) => {
    setPolicies((p) => ({
      ...p,
      restrictedCompanies: p.restrictedCompanies.map((c) =>
        c.companyId === companyId ? { ...c, allowedModels: models } : c,
      ),
    }));
  };

  const removeCompanyOverride = (companyId: string) => {
    setPolicies((p) => ({
      ...p,
      restrictedCompanies: p.restrictedCompanies.filter((c) => c.companyId !== companyId),
    }));
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading policies...</p>;
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {error != null && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load policies"}
        </p>
      )}

      {/* Allowed models */}
      <section>
        <h2 className="text-base font-semibold mb-1">Allowed Models</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Select which models agents can use. Leave all unchecked to allow all models.
        </p>
        <ModelCheckboxList
          selected={policies.allowedModels}
          onChange={(models) => setPolicies((p) => ({ ...p, allowedModels: models }))}
        />
        {policies.allowedModels.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground/70">All models are allowed (no restriction).</p>
        )}
      </section>

      {/* Budget limits */}
      <section>
        <h2 className="text-base font-semibold mb-1">Budget Limits</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Set spending thresholds. Enter 0 for unlimited.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Max monthly budget per agent ($)
            </label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={policies.maxBudgetPerAgentMonthly / 100}
              onChange={(e) =>
                setPolicies((p) => ({
                  ...p,
                  maxBudgetPerAgentMonthly: Math.round(parseFloat(e.target.value || "0") * 100),
                }))
              }
              placeholder="0 = unlimited"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Stored as {policies.maxBudgetPerAgentMonthly}¢
            </p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Require approval above ($ per run)
            </label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={policies.requireApprovalAbove / 100}
              onChange={(e) =>
                setPolicies((p) => ({
                  ...p,
                  requireApprovalAbove: Math.round(parseFloat(e.target.value || "0") * 100),
                }))
              }
              placeholder="0 = never"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Stored as {policies.requireApprovalAbove}¢
            </p>
          </div>
        </div>
      </section>

      {/* Company overrides */}
      <section>
        <h2 className="text-base font-semibold mb-1">Company-Specific Overrides</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Restrict specific companies to a subset of models.
        </p>

        <div className="space-y-3 mb-4">
          {policies.restrictedCompanies.length === 0 && (
            <p className="text-sm text-muted-foreground/70">No company overrides configured.</p>
          )}
          {policies.restrictedCompanies.map((c) => (
            <CompanyOverrideRow
              key={c.companyId}
              companyId={c.companyId}
              allowedModels={c.allowedModels}
              onChange={updateCompanyOverride}
              onRemove={removeCompanyOverride}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={newCompanyId}
            onChange={(e) => setNewCompanyId(e.target.value)}
            placeholder="Company UUID..."
            className="font-mono text-sm max-w-xs"
            onKeyDown={(e) => { if (e.key === "Enter") addCompanyOverride(); }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCompanyOverride}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add Company
          </Button>
        </div>
      </section>

      {/* Save button */}
      <div className="pt-2 border-t border-border">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving..." : "Save Policies"}
        </Button>
      </div>
    </div>
  );
}
