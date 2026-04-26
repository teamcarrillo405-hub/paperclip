import type { Request, Response, NextFunction } from "express";

export type DLPPattern = { name: string; pattern: RegExp; replacement: string };
export type DLPScanResult = { clean: boolean; findings: string[]; redacted: string };

export const BUILT_IN_PATTERNS: DLPPattern[] = [
  {
    name: "SSN",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[SSN REDACTED]",
  },
  {
    name: "CreditCard",
    pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
    replacement: "[CARD REDACTED]",
  },
  {
    name: "Email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: "[EMAIL REDACTED]",
  },
  {
    name: "Phone",
    pattern: /\b(?:\+1\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    replacement: "[PHONE REDACTED]",
  },
  {
    name: "AWSKey",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[AWS-KEY REDACTED]",
  },
  {
    name: "PrivateKey",
    pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: "[PRIVATE-KEY REDACTED]",
  },
  {
    name: "InternalIP",
    pattern: /\b(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)\d+\.\d+\b/g,
    replacement: "[INTERNAL-IP REDACTED]",
  },
];

export function scanText(text: string): DLPScanResult {
  const findings: string[] = [];
  let redacted = text;

  for (const p of BUILT_IN_PATTERNS) {
    // Reset lastIndex since patterns are defined with /g
    p.pattern.lastIndex = 0;
    const matches = text.match(p.pattern);
    if (matches && matches.length > 0) {
      findings.push(`${p.name} (${matches.length} match${matches.length > 1 ? "es" : ""})`);
      p.pattern.lastIndex = 0;
      redacted = redacted.replace(p.pattern, p.replacement);
    }
  }

  return {
    clean: findings.length === 0,
    findings,
    redacted,
  };
}

export function dlpEnabled(): boolean {
  return process.env.DLP_ENABLED === "true";
}

const SENSITIVE_FIELDS = new Set(["content", "text", "prompt", "response"]);

function redactSensitiveFields(obj: unknown, findings: string[]): unknown {
  if (typeof obj === "string") {
    const result = scanText(obj);
    if (!result.clean) {
      findings.push(...result.findings);
      return result.redacted;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item, findings));
  }

  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_FIELDS.has(key) && typeof value === "string") {
        const result = scanText(value);
        if (!result.clean) {
          findings.push(...result.findings.map((f) => `[field:${key}] ${f}`));
          out[key] = result.redacted;
        } else {
          out[key] = value;
        }
      } else {
        out[key] = redactSensitiveFields(value, findings);
      }
    }
    return out;
  }

  return obj;
}

export function createDLPLogFilter() {
  return function dlpLogFilter(req: Request, res: Response, next: NextFunction): void {
    if (!dlpEnabled()) {
      next();
      return;
    }

    const originalJson = res.json.bind(res);

    res.json = function (body: unknown): Response {
      // Only inspect — never block. Always send the original body.
      try {
        const findings: string[] = [];
        redactSensitiveFields(body, findings);
        if (findings.length > 0) {
          console.warn(
            `[DLP] PII detected in response for ${req.method} ${req.path}: ${findings.join(", ")}`,
          );
        }
      } catch (err) {
        console.error("[DLP] Error during DLP scan:", err);
      }
      return originalJson(body);
    };

    next();
  };
}
