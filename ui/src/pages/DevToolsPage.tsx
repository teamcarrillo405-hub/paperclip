import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Navigate, Link } from "@/lib/router";
import { Terminal, CheckCircle, XCircle, Settings, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

type DevStatus = {
  devMode: boolean;
  version: string;
  nodeEnv: string;
  features: string[];
};

type DevPlugin = { name: string; packageName: string };
type DevPluginsResponse = { plugins: DevPlugin[] };

type EnvVarCheck = { key: string; set: boolean };
type Integration = {
  name: string;
  envVars: EnvVarCheck[];
  configured: boolean;
};
type EnvCheckResponse = { integrations: Integration[] };

type TypecheckResult = {
  code: number;
  stdout: string;
  stderr: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

const QUICK_LINKS = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/issues", label: "Issues" },
  { path: "/routines", label: "Routines" },
  { path: "/goals", label: "Goals" },
  { path: "/customers", label: "Customers" },
  { path: "/social", label: "Social Media" },
  { path: "/marketing", label: "Marketing" },
  { path: "/crews", label: "AI Crews" },
  { path: "/knowledge", label: "Knowledge Base" },
  { path: "/email", label: "Email" },
  { path: "/video-studio", label: "Video Studio" },
  { path: "/automations", label: "Automations" },
  { path: "/compliance", label: "Compliance" },
  { path: "/onboarding", label: "Setup Guide" },
  { path: "/company/settings", label: "Company Settings" },
  { path: "/roi", label: "ROI Dashboard" },
  { path: "/financial-health", label: "Financial Health" },
];

export function DevToolsPage() {
  if (!DEV_MODE) {
    return <Navigate to="/" />;
  }

  const [typecheckOutput, setTypecheckOutput] = useState<TypecheckResult | null>(null);

  const statusQuery = useQuery<DevStatus>({
    queryKey: ["dev", "status"],
    queryFn: () => fetchJson<DevStatus>("/api/dev/status"),
  });

  const pluginsQuery = useQuery<DevPluginsResponse>({
    queryKey: ["dev", "plugins"],
    queryFn: () => fetchJson<DevPluginsResponse>("/api/dev/plugins"),
  });

  const envQuery = useQuery<EnvCheckResponse>({
    queryKey: ["dev", "env-check"],
    queryFn: () => fetchJson<EnvCheckResponse>("/api/dev/env-check"),
  });

  const typecheckMutation = useMutation({
    mutationFn: () =>
      fetchJson<TypecheckResult>("/api/dev/typecheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (result) => {
      setTypecheckOutput(result);
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Terminal className="h-6 w-6" style={{ color: "#2563eb" }} />
        <h1 className="text-2xl font-semibold">Dev Tools</h1>
        <span
          className="rounded-md px-2 py-1 text-xs font-bold text-white"
          style={{ backgroundColor: "#16a34a" }}
        >
          DEV MODE
        </span>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            System Status
          </CardTitle>
          <CardDescription>Runtime environment and feature flags</CardDescription>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : statusQuery.error ? (
            <p className="text-sm text-red-500">Failed to load status</p>
          ) : statusQuery.data ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="font-medium">Version</dt>
              <dd>{statusQuery.data.version}</dd>
              <dt className="font-medium">Node Env</dt>
              <dd>{statusQuery.data.nodeEnv}</dd>
              <dt className="font-medium">Dev Mode</dt>
              <dd>{statusQuery.data.devMode ? "enabled" : "disabled"}</dd>
              <dt className="font-medium">Feature Flags</dt>
              <dd>
                {statusQuery.data.features.length === 0
                  ? "none"
                  : statusQuery.data.features.join(", ")}
              </dd>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Registered Plugins
          </CardTitle>
          <CardDescription>Plugins discovered in packages/plugins/</CardDescription>
        </CardHeader>
        <CardContent>
          {pluginsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : pluginsQuery.error ? (
            <p className="text-sm text-red-500">Failed to load plugins</p>
          ) : pluginsQuery.data ? (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Package</th>
                </tr>
              </thead>
              <tbody>
                {pluginsQuery.data.plugins.map((p) => (
                  <tr key={p.name} className="border-b last:border-0">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 font-mono text-xs">{p.packageName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment Check</CardTitle>
          <CardDescription>
            Shows which env vars are set for each integration (values are never displayed)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {envQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : envQuery.error ? (
            <p className="text-sm text-red-500">Failed to load env check</p>
          ) : envQuery.data ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {envQuery.data.integrations.map((integ) => (
                <div
                  key={integ.name}
                  className="rounded-lg border p-3 text-sm"
                >
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    {integ.configured ? (
                      <CheckCircle
                        className="h-4 w-4"
                        style={{ color: "#16a34a" }}
                      />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    {integ.name}
                  </div>
                  <ul className="space-y-1">
                    {integ.envVars.map((ev) => (
                      <li
                        key={ev.key}
                        className="flex items-center gap-2 font-mono text-xs"
                      >
                        {ev.set ? (
                          <CheckCircle
                            className="h-3 w-3"
                            style={{ color: "#16a34a" }}
                          />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        <span>{ev.key}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TypeCheck</CardTitle>
          <CardDescription>
            Run <code>npx tsc --noEmit</code> against the repo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => typecheckMutation.mutate()}
            disabled={typecheckMutation.isPending}
            style={{ backgroundColor: "#2563eb" }}
          >
            {typecheckMutation.isPending ? "Running…" : "Run Typecheck"}
          </Button>
          {typecheckOutput ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm">
                Exit code:{" "}
                <span className="font-mono">{typecheckOutput.code}</span>
              </p>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                {typecheckOutput.stdout || typecheckOutput.stderr || "(no output)"}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
          <CardDescription>Jump to any major page in the app</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default DevToolsPage;
