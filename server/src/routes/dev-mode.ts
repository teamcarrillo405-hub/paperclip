import { Router } from "express";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { assertAuthenticated } from "./authz.js";

function isDevMode(): boolean {
  return process.env.VITE_DEV_MODE === "true";
}

const FEATURE_FLAGS = [
  "AIDER_ENABLED",
  "GOOSE_ENABLED",
  "CREWAI_ENABLED",
  "N8N_ENABLED",
  "POSTAL_ENABLED",
  "CHAT_WIDGET_ENABLED",
  "GUARDIAN_ENABLED",
  "RESELLER_ENABLED",
];

type IntegrationEnv = {
  name: string;
  envVars: string[];
};

const INTEGRATIONS: IntegrationEnv[] = [
  { name: "Database", envVars: ["DATABASE_URL"] },
  { name: "Anthropic", envVars: ["ANTHROPIC_API_KEY"] },
  { name: "OpenAI", envVars: ["OPENAI_API_KEY"] },
  { name: "QuickBooks", envVars: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"] },
  { name: "Email (SMTP)", envVars: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] },
  { name: "Twilio (Voice/SMS)", envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"] },
  { name: "Slack", envVars: ["SLACK_BOT_TOKEN"] },
  { name: "GitHub", envVars: ["GITHUB_TOKEN"] },
  { name: "Stripe (Billing)", envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  { name: "AWS S3", envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"] },
  { name: "n8n", envVars: ["N8N_URL", "N8N_API_KEY"] },
  { name: "Aider", envVars: ["AIDER_ENABLED"] },
  { name: "Goose", envVars: ["GOOSE_ENABLED"] },
  { name: "Remotion", envVars: ["REMOTION_ENABLED"] },
  { name: "Postal (Email Server)", envVars: ["POSTAL_API_URL", "POSTAL_API_KEY"] },
  { name: "Chat Widget", envVars: ["CHAT_WIDGET_ENABLED"] },
  { name: "Guardian", envVars: ["GUARDIAN_ENABLED"] },
  { name: "Reseller Program", envVars: ["RESELLER_ENABLED"] },
  { name: "Knowledge Base", envVars: ["KB_STORAGE_DIR"] },
  { name: "Mobile Push", envVars: ["FCM_SERVER_KEY"] },
];

async function listPlugins(): Promise<Array<{ name: string; packageName: string }>> {
  const root = path.resolve(process.cwd(), "packages", "plugins");
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        name: e.name,
        packageName: `@paperclipai/plugin-${e.name}`,
      }));
  } catch {
    return [];
  }
}

async function listSchemas(): Promise<string[]> {
  const root = path.resolve(process.cwd(), "packages", "db", "src", "schema");
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".ts") && e.name !== "index.ts")
      .map((e) => e.name.replace(/\.ts$/, ""))
      .sort();
  } catch {
    return [];
  }
}

function runTypecheck(): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsc", "--noEmit"], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 200_000) stdout = stdout.slice(-200_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 120_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(err) });
    });
  });
}

export function devModeRoutes() {
  const router = Router();

  router.use("/dev", (_req, res, next) => {
    if (!isDevMode()) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  });

  router.get("/dev/status", (req, res) => {
    assertAuthenticated(req);
    const features: string[] = [];
    for (const flag of FEATURE_FLAGS) {
      if (process.env[flag] === "true") features.push(flag);
    }
    res.json({
      devMode: true,
      version: process.env.npm_package_version ?? "0.0.0",
      nodeEnv: process.env.NODE_ENV ?? "development",
      features,
    });
  });

  router.get("/dev/plugins", async (req, res) => {
    assertAuthenticated(req);
    const plugins = await listPlugins();
    res.json({ plugins });
  });

  router.get("/dev/schemas", async (req, res) => {
    assertAuthenticated(req);
    const schemas = await listSchemas();
    res.json({ schemas });
  });

  router.get("/dev/env-check", (req, res) => {
    assertAuthenticated(req);
    const integrations = INTEGRATIONS.map((integ) => ({
      name: integ.name,
      envVars: integ.envVars.map((key) => ({
        key,
        set: typeof process.env[key] === "string" && process.env[key]!.length > 0,
      })),
      configured: integ.envVars.every(
        (key) => typeof process.env[key] === "string" && process.env[key]!.length > 0,
      ),
    }));
    res.json({ integrations });
  });

  router.post("/dev/typecheck", async (req, res) => {
    assertAuthenticated(req);
    const result = await runTypecheck();
    res.json(result);
  });

  return router;
}
