import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { agentsApi } from "../api/agents";
import { companySkillsApi } from "../api/companySkills";
import { queryKeys } from "../lib/queryKeys";
import { AGENT_ROLES } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Shield, LoaderCircle, Building2, AlertCircle } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { cn, agentUrl } from "../lib/utils";
import { roleLabels } from "../components/agent-config-primitives";
import { AgentConfigForm, type CreateConfigValues } from "../components/AgentConfigForm";
import { defaultCreateValues } from "../components/agent-config-defaults";
import { getUIAdapter, listUIAdapters } from "../adapters";
import { useDisabledAdaptersSync } from "../adapters/use-disabled-adapters";
import { isValidAdapterType } from "../adapters/metadata";
import { ReportsToPicker } from "../components/ReportsToPicker";
import { buildNewAgentRuntimeConfig } from "../lib/new-agent-runtime-config";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";

function createValuesForAdapterType(
  adapterType: CreateConfigValues["adapterType"],
): CreateConfigValues {
  const { adapterType: _discard, ...defaults } = defaultCreateValues;
  const nextValues: CreateConfigValues = { ...defaults, adapterType };
  if (adapterType === "codex_local") {
    nextValues.model = DEFAULT_CODEX_LOCAL_MODEL;
    nextValues.dangerouslyBypassSandbox =
      DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
  } else if (adapterType === "gemini_local") {
    nextValues.model = DEFAULT_GEMINI_LOCAL_MODEL;
  } else if (adapterType === "cursor") {
    nextValues.model = DEFAULT_CURSOR_LOCAL_MODEL;
  } else if (adapterType === "opencode_local") {
    nextValues.model = "";
  }
  return nextValues;
}

export function NewAgent() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetAdapterType = searchParams.get("adapterType");

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("general");
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<CreateConfigValues>(defaultCreateValues);
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<string[]>([]);
  const [roleOpen, setRoleOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const roleTriggerRef = useRef<HTMLButtonElement>(null);

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching,
    refetch: refetchAdapterModels,
  } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.agents.adapterModels(selectedCompanyId, configValues.adapterType)
      : ["agents", "none", "adapter-models", configValues.adapterType],
    queryFn: () => agentsApi.adapterModels(selectedCompanyId!, configValues.adapterType),
    enabled: Boolean(selectedCompanyId),
  });

  const { data: companySkills, isLoading: companySkillsLoading, isError: companySkillsError, refetch: refetchCompanySkills } = useQuery({
    queryKey: queryKeys.companySkills.list(selectedCompanyId ?? ""),
    queryFn: () => companySkillsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const isFirstAgent = !agentsLoading && (!agents || agents.length === 0);
  const effectiveRole = isFirstAgent ? "ceo" : role;

  useEffect(() => {
    setBreadcrumbs([
      { label: "Agents", href: "/agents" },
      { label: "New Agent" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (isFirstAgent) {
      if (!name) setName("CEO");
      if (!title) setTitle("CEO");
    }
  }, [isFirstAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const requested = presetAdapterType;
    if (!requested) return;
    if (!isValidAdapterType(requested)) return;
    setConfigValues((prev) => {
      if (prev.adapterType === requested) return prev;
      return createValuesForAdapterType(requested as CreateConfigValues["adapterType"]);
    });
  }, [presetAdapterType]);

  const createAgent = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      agentsApi.hire(selectedCompanyId!, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(agentUrl(result.agent));
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Failed to create agent");
    },
  });

  function buildAdapterConfig() {
    const adapter = getUIAdapter(configValues.adapterType);
    return adapter.buildAdapterConfig(configValues);
  }

  function handleSubmit() {
    if (!selectedCompanyId || !name.trim()) return;
    setFormError(null);
    if (configValues.adapterType === "opencode_local") {
      const selectedModel = configValues.model.trim();
      if (!selectedModel) {
        setFormError("OpenCode requires an explicit model in provider/model format.");
        return;
      }
      if (adapterModelsError) {
        setFormError(
          adapterModelsError instanceof Error
            ? adapterModelsError.message
            : "Failed to load OpenCode models.",
        );
        return;
      }
      if (adapterModelsLoading || adapterModelsFetching) {
        setFormError("OpenCode models are still loading. Please wait and try again.");
        return;
      }
      const discovered = adapterModels ?? [];
      if (!discovered.some((entry) => entry.id === selectedModel)) {
        setFormError(
          discovered.length === 0
            ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
            : `Configured OpenCode model is unavailable: ${selectedModel}`,
        );
        return;
      }
    }
    createAgent.mutate({
      name: name.trim(),
      role: effectiveRole,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(reportsTo ? { reportsTo } : {}),
      ...(selectedSkillKeys.length > 0 ? { desiredSkills: selectedSkillKeys } : {}),
      adapterType: configValues.adapterType,
      adapterConfig: buildAdapterConfig(),
      runtimeConfig: buildNewAgentRuntimeConfig({
        heartbeatEnabled: configValues.heartbeatEnabled,
        intervalSec: configValues.intervalSec,
      }),
      budgetMonthlyCents: 0,
    });
  }

  const availableSkills = (companySkills ?? []).filter((skill) => !skill.key.startsWith("paperclipai/paperclip/"));

  function toggleSkill(key: string, checked: boolean) {
    setSelectedSkillKeys((prev) => {
      if (checked) {
        return prev.includes(key) ? prev : [...prev, key];
      }
      return prev.filter((value) => value !== key);
    });
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={Building2} message="Select a company to create an agent." />;
  }

  return (
    <form className="mx-auto max-w-2xl space-y-6" aria-label="Create new agent" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Agent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure identity, adapter, and optional skills for the new agent.
        </p>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <fieldset className="space-y-4 border-0 p-0 m-0">
          <legend className="sr-only">Agent identity</legend>
          {/* Visible section heading for sighted users */}
          <div className="px-4 pt-4 pb-0">
            <h2 className="text-sm font-semibold text-foreground">Agent identity</h2>
          </div>
          {/* Name */}
          <div className="px-4 pt-2 pb-2">
            <label htmlFor="new-agent-name" className="text-sm font-medium">Agent name</label>
            <input
              id="new-agent-name"
              className="w-full text-lg font-semibold bg-transparent border border-input rounded-md px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
              placeholder="Agent name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              aria-required="true"
            />
          </div>

          {/* Title */}
          <div className="px-4 pb-2">
            <label htmlFor="new-agent-title" className="text-sm font-medium">Title</label>
            <input
              id="new-agent-title"
              className="w-full bg-transparent border-b border-input outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 text-sm text-muted-foreground placeholder:text-muted-foreground/40"
              placeholder="Title (e.g. VP of Engineering)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </fieldset>

        {/* Property chips: Role + Reports To */}
        <div className="px-4 pt-2 pb-1 border-t border-border">
          <h2 className="text-sm font-semibold text-foreground">Role</h2>
          <span id="role-label" className="sr-only">Role</span>
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2 flex-wrap">
          {agentsLoading && (
            <div className="h-8 rounded bg-muted animate-pulse w-24" />
          )}
          {!agentsLoading && (
            <Popover open={roleOpen} onOpenChange={setRoleOpen}>
              <PopoverTrigger asChild>
                <button
                  ref={roleTriggerRef}
                  type="button"
                  aria-labelledby="role-label"
                  aria-label={`Agent role: ${effectiveRole}`}
                  aria-expanded={roleOpen}
                  aria-haspopup="menu"
                  aria-controls="role-menu"
                  aria-disabled={isFirstAgent || undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors",
                    isFirstAgent && "opacity-60 cursor-not-allowed"
                  )}
                  onClick={(e) => {
                    if (isFirstAgent) { e.preventDefault(); return; }
                  }}
                >
                  <Shield className="h-3 w-3 text-muted-foreground" />
                  {roleLabels[effectiveRole] ?? effectiveRole}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1" align="start">
                <div
                  id="role-menu"
                  role="menu"
                  ref={menuRef}
                  onKeyDown={(e) => {
                    const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
                    if (!items) return;
                    const arr = Array.from(items) as HTMLElement[];
                    const idx = arr.indexOf(document.activeElement as HTMLElement);
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      arr[(idx + 1) % arr.length]?.focus();
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      arr[(idx - 1 + arr.length) % arr.length]?.focus();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRoleOpen(false);
                      roleTriggerRef.current?.focus();
                    }
                  }}
                >
                  {AGENT_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="menuitem"
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                        r === role && "bg-accent"
                      )}
                      onClick={() => { setRole(r); setRoleOpen(false); }}
                    >
                      {roleLabels[r] ?? r}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {!agentsLoading && (
            <ReportsToPicker
              agents={agents ?? []}
              value={reportsTo}
              onChange={setReportsTo}
              disabled={isFirstAgent}
            />
          )}
        </div>
        {isFirstAgent && (
          <p className="px-4 pb-2 text-xs text-muted-foreground">This agent will be the CEO — role and reporting are fixed.</p>
        )}

        {/* AI Adapter section */}
        <div className="border-t border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            AI Adapter
            {(adapterModelsLoading || adapterModelsFetching) && (
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
          </h2>
          {adapterModelsError && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive mt-2">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                {adapterModelsError instanceof Error ? adapterModelsError.message : "Failed to load adapter models."}
              </span>
              <Button size="sm" variant="ghost" className="h-auto px-1 py-0 text-xs text-destructive/70 hover:text-destructive" onClick={() => refetchAdapterModels()}>
                Retry
              </Button>
            </div>
          )}
        </div>
        <AgentConfigForm
          mode="create"
          values={configValues}
          onChange={(patch) => setConfigValues((prev) => ({ ...prev, ...patch }))}
          adapterModels={adapterModels}
        />

        <div className="border-t border-border px-4 py-4">
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Company skills</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional skills from the company library. Built-in Paperclip runtime skills are added automatically.
              </p>
            </div>
            {companySkillsError ? (
              <div className="flex items-center gap-2">
                <p role="alert" className="text-xs text-destructive">Could not load company skills.</p>
                <Button variant="ghost" size="sm" onClick={() => void refetchCompanySkills()}>Retry</Button>
              </div>
            ) : companySkillsLoading ? (
              <div className="space-y-1" role="status" aria-label="Loading company skills">
                {[1, 2, 3].map((i) => <div key={i} className="h-6 rounded bg-muted animate-pulse" aria-hidden="true" />)}
              </div>
            ) : availableSkills.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                <>No company skills installed. <Link to="/company/skills" className="underline text-xs">Manage skills</Link></>
              </p>
            ) : (
              <fieldset className="border-0 p-0 m-0">
                <legend className="sr-only">Company skills</legend>
                <div className="space-y-3">
                  {availableSkills.map((skill) => {
                    const inputId = `skill-${skill.id}`;
                    const checked = selectedSkillKeys.includes(skill.key);
                    return (
                      <div key={skill.id} className="flex items-start gap-3">
                        <Checkbox
                          id={inputId}
                          checked={checked}
                          onCheckedChange={(next) => toggleSkill(skill.key, next === true)}
                        />
                        <label htmlFor={inputId} className="grid gap-1 leading-none">
                          <span className="text-sm font-medium">{skill.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {skill.description ?? skill.key}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3">
          {formError && (
            <div role="alert" className="flex items-center gap-2 text-sm text-destructive mb-2">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}
          {!name.trim() && <p id="submit-hint" className="text-xs text-muted-foreground text-right">Enter an agent name to continue.</p>}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate("/agents")}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || createAgent.isPending}
              aria-busy={createAgent.isPending}
              aria-describedby={!name.trim() ? "submit-hint" : undefined}
            >
              {createAgent.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {createAgent.isPending ? "Creating…" : "Create agent"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
