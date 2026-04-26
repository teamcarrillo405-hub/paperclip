import crypto from "node:crypto";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function twilioAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

function accountSid(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) throw new Error("TWILIO_ACCOUNT_SID must be set");
  return sid;
}

interface TwilioMessageResponse {
  sid: string;
  status: string;
  error_code: number | null;
  error_message: string | null;
}

async function postMessage(to: string, from: string, body: string): Promise<{ sid: string }> {
  const sid = accountSid();
  const url = `${TWILIO_API_BASE}/Accounts/${sid}/Messages.json`;

  const params = new URLSearchParams({ To: to, From: from, Body: body });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: twilioAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = (await response.json()) as TwilioMessageResponse;

  if (!response.ok) {
    const errorMsg = data.error_message ?? `Twilio API error ${response.status}`;
    throw new Error(`Twilio send failed: ${errorMsg} (code ${data.error_code ?? "unknown"})`);
  }

  return { sid: data.sid };
}

/**
 * Send an SMS message via Twilio.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in env.
 */
export async function sendSms(to: string, body: string): Promise<{ sid: string }> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) throw new Error("TWILIO_PHONE_NUMBER must be set");
  return postMessage(to, from, body);
}

/**
 * Send a WhatsApp message via Twilio.
 * `to` should be E.164 without the "whatsapp:" prefix (e.g. "+14155552671").
 * Uses TWILIO_WHATSAPP_NUMBER (defaults to the Twilio sandbox number).
 */
export async function sendWhatsApp(to: string, body: string): Promise<{ sid: string }> {
  const rawFrom =
    process.env.TWILIO_WHATSAPP_NUMBER ?? "whatsapp:+14155238886";
  const from = rawFrom.startsWith("whatsapp:") ? rawFrom : `whatsapp:${rawFrom}`;
  const normalizedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  return postMessage(normalizedTo, from, body);
}

/**
 * Validate an inbound Twilio webhook signature.
 *
 * Twilio signs webhooks with HMAC-SHA1 over:
 *   url + alphabetically-sorted param key-value pairs (concatenated, no separators).
 *
 * Returns true when the computed signature matches the X-Twilio-Signature header.
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  // Build the string-to-sign: URL followed by sorted params, each key immediately
  // followed by its value with no separator between pairs.
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${k}${params[k] ?? ""}`).join("");
  const stringToSign = url + paramString;

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(stringToSign)
    .digest("base64");

  // Constant-time comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Buffers of different length throw; signatures don't match.
    return false;
  }
}
