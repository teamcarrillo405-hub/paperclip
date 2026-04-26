/**
 * Voice AI orchestration service.
 *
 * Manages in-memory call sessions (calls are short-lived — no file store needed),
 * generates AI replies via OpenAI, and wraps ElevenLabs TTS for future <Play>
 * TwiML upgrades.
 */

import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export interface VoiceSession {
  callSid: string;
  companyId: string;
  from: string;
  transcript: string[]; // running conversation
  status: "active" | "ended";
  startedAt: string;
}

// ---------------------------------------------------------------------------
// In-memory session store
// ---------------------------------------------------------------------------

const sessions = new Map<string, VoiceSession>();

export function createVoiceSession(
  callSid: string,
  companyId: string,
  from: string,
): VoiceSession {
  const session: VoiceSession = {
    callSid,
    companyId,
    from,
    transcript: [],
    status: "active",
    startedAt: new Date().toISOString(),
  };
  sessions.set(callSid, session);
  logger.info({ callSid, companyId, from }, "voice-ai: session created");
  return session;
}

export function getVoiceSession(callSid: string): VoiceSession | undefined {
  return sessions.get(callSid);
}

export function endVoiceSession(callSid: string): void {
  const session = sessions.get(callSid);
  if (session) {
    session.status = "ended";
    logger.info({ callSid }, "voice-ai: session ended");
    // Retain for a short window so status callbacks can still find it.
    setTimeout(() => sessions.delete(callSid), 5 * 60 * 1000);
  }
}

export function listActiveSessions(): VoiceSession[] {
  return Array.from(sessions.values()).filter((s) => s.status === "active");
}

// ---------------------------------------------------------------------------
// AI reply generation (OpenAI)
// ---------------------------------------------------------------------------

/**
 * Generate a short spoken reply using OpenAI.
 * Falls back to a safe canned response if the API key is missing or the call
 * fails so that the phone call is never left silent.
 */
export async function generateVoiceReply(
  session: VoiceSession,
  userSpeech: string,
): Promise<string> {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    logger.warn({ callSid: session.callSid }, "voice-ai: OPENAI_API_KEY not set; using fallback");
    return "I'm sorry, I'm not fully configured yet. Please call back later or leave a message.";
  }

  // Build a minimal conversation history so the model has context.
  const systemPrompt =
    "You are a helpful AI phone assistant. Speak naturally and concisely. "
    + "Reply in 1–2 short sentences suitable for being read aloud over the phone. "
    + "Do not use markdown, bullet points, or special characters.";

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  // Inject up to the last 6 transcript turns for context.
  const history = session.transcript.slice(-6);
  for (let i = 0; i < history.length; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: history[i]!,
    });
  }

  messages.push({ role: "user", content: userSpeech });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 80,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => String(response.status));
      logger.error({ callSid: session.callSid, status: response.status, errText }, "voice-ai: OpenAI error");
      return "I'm sorry, I had trouble understanding that. Could you please repeat?";
    }

    const data = (await response.json()) as {
      choices: { message: { content: string | null } }[];
    };

    const reply = data.choices[0]?.message?.content?.trim() ?? "";
    if (!reply) {
      return "I'm sorry, I didn't catch that. Could you please say that again?";
    }
    return reply;
  } catch (err) {
    logger.error({ err, callSid: session.callSid }, "voice-ai: generateVoiceReply failed");
    return "I'm sorry, something went wrong on my end. Please try again in a moment.";
  }
}

// ---------------------------------------------------------------------------
// ElevenLabs TTS (reserved for future <Play> TwiML upgrade)
// ---------------------------------------------------------------------------

/**
 * Convert text to speech via ElevenLabs and return an MP3 buffer.
 * Currently reserved for future use — active calls use Twilio Polly <Say>.
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId =
    process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// Greeting helper
// ---------------------------------------------------------------------------

export function buildGreeting(_companyId: string): string {
  return "Thank you for calling. I'm your AI assistant. How can I help you today?";
}
