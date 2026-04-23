// PII detection and masking utilities.
// Detects SSN, credit cards, phone numbers, emails, and dates of birth in free text
// and masks them before storage. Use detectAndMaskPii() to transform any value
// (string, array, or record) and receive both the masked value and a detection flag.

const SSN_RE = /\b(\d{3})-?(\d{2})-?(\d{4})\b/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;
const PHONE_RE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// DOB — common date formats including MM/DD/YYYY, YYYY-MM-DD, Month DD YYYY
const DOB_RE =
  /\b(?:(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}|(?:19|20)\d{2}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+(?:19|20)\d{2})\b/g;

export interface PiiDetectionResult<T = unknown> {
  value: T;
  piiDetected: boolean;
}

function maskSsn(match: string): string {
  const digits = match.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `***-**-${last4}`;
}

function maskCreditCard(match: string): string {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return match;
  const last4 = digits.slice(-4);
  return `****-****-****-${last4}`;
}

function maskPhone(match: string): string {
  const digits = match.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}

function maskEmail(match: string): string {
  const atIdx = match.indexOf("@");
  if (atIdx <= 0) return match;
  const local = match.slice(0, atIdx);
  const domain = match.slice(atIdx);
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(1, local.length - 1))}${domain}`;
}

function maskDob(match: string): string {
  return "****-**-**";
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function maskPiiInString(input: string): { value: string; detected: boolean } {
  if (!input) return { value: input, detected: false };
  let detected = false;
  let output = input;

  output = output.replace(SSN_RE, (m) => {
    detected = true;
    return maskSsn(m);
  });

  output = output.replace(CREDIT_CARD_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      detected = true;
      return maskCreditCard(m);
    }
    return m;
  });

  output = output.replace(PHONE_RE, (m) => {
    detected = true;
    return maskPhone(m);
  });

  output = output.replace(EMAIL_RE, (m) => {
    detected = true;
    return maskEmail(m);
  });

  output = output.replace(DOB_RE, (m) => {
    detected = true;
    return maskDob(m);
  });

  return { value: output, detected };
}

export function detectAndMaskPii<T>(value: T): PiiDetectionResult<T> {
  let anyDetected = false;

  function walk(v: unknown): unknown {
    if (typeof v === "string") {
      const { value: masked, detected } = maskPiiInString(v);
      if (detected) anyDetected = true;
      return masked;
    }
    if (Array.isArray(v)) {
      return v.map(walk);
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        out[k] = walk(child);
      }
      return out;
    }
    return v;
  }

  const masked = walk(value) as T;
  return { value: masked, piiDetected: anyDetected };
}
