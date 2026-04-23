import type {
  GeneratedPost,
  GeneratePostContentInput,
  SocialContentTone,
  SocialPlatform,
} from "./types.js";

export interface ContentGeneratorOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

const PLATFORM_GUIDE: Record<SocialPlatform, string> = {
  instagram:
    "Instagram: write a vivid caption (up to ~2,200 chars) with line breaks, emojis where natural, and finish with 5–12 targeted hashtags on a separate block.",
  linkedin:
    "LinkedIn: professional and value-forward (200–700 chars). Open with a hook, share an insight, end with a clear CTA. No hashtags are fine; keep any to 2–3 niche ones.",
  x:
    "X (Twitter): strictly under 280 characters, punchy, no em-dashes, at most 1–2 hashtags, include a single link if relevant.",
  reddit:
    "Reddit: authentic, conversational, no marketing speak. Provide genuine value. Start with a real-person title, then a body that invites discussion.",
  google_business:
    "Google Business Profile: local-business update, 150–1500 chars. Lead with the offer or event, include location cue and an obvious CTA (call / visit / book).",
};

function toneDescriptor(tone: SocialContentTone): string {
  switch (tone) {
    case "professional":
      return "professional, credible, and concise";
    case "casual":
      return "casual and friendly";
    case "playful":
      return "playful and witty, light humor where it fits";
    case "authoritative":
      return "authoritative, expert-led, confident";
    case "enthusiastic":
      return "enthusiastic and energetic";
    case "empathetic":
      return "empathetic and warm, acknowledging the reader's perspective";
  }
}

/**
 * OpenAI-backed content generator that produces one tailored post per platform.
 *
 * Each platform gets its own completion so the model can optimize tone, length,
 * and formatting independently (hashtags on Instagram, ≤280 chars on X, etc.).
 */
export function createContentGenerator(opts: ContentGeneratorOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const model = opts.model ?? "gpt-4o-mini";
  const baseUrl = (opts.baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");

  async function complete(messages: OpenAIChatMessage[]): Promise<string> {
    const res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI content generation failed (${res.status}): ${text}`);
    }
    const payload = (await res.json()) as OpenAIChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content ?? "";
    return content.trim();
  }

  async function generate(input: GeneratePostContentInput): Promise<GeneratedPost[]> {
    const tone = toneDescriptor(input.tone);
    const promises = input.platforms.map(async (platform): Promise<GeneratedPost> => {
      const guide = PLATFORM_GUIDE[platform];
      const system =
        "You are a senior social-media strategist for small and mid-sized businesses. " +
        "Write platform-native posts that sound human, avoid marketing clichés, and match the platform's norms exactly.";
      const user = [
        `Topic: ${input.topic}`,
        `Tone: ${tone}`,
        `Platform rules: ${guide}`,
        "",
        "Return only the post body text. Do not wrap in quotes. If the platform calls for hashtags, include them inline at the end as appropriate.",
      ].join("\n");

      const text = await complete([
        { role: "system", content: system },
        { role: "user", content: user },
      ]);

      return {
        platform,
        content: text,
        hashtags: extractHashtags(text),
        warnings: lintForPlatform(platform, text),
      };
    });

    return Promise.all(promises);
  }

  return { generate };
}

export type ContentGenerator = ReturnType<typeof createContentGenerator>;

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}0-9_]+/gu);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

function lintForPlatform(platform: SocialPlatform, text: string): string[] | undefined {
  const warnings: string[] = [];
  if (platform === "x" && text.length > 280) {
    warnings.push(`X post is ${text.length} chars — exceeds 280-char limit.`);
  }
  if (platform === "instagram" && text.length > 2200) {
    warnings.push(`Instagram caption is ${text.length} chars — exceeds 2,200-char limit.`);
  }
  return warnings.length ? warnings : undefined;
}
