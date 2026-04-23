import { ElevenLabsClient } from "elevenlabs";
import type { ElevenLabsTtsOptions, ElevenLabsTtsResult } from "./types.js";

/**
 * ElevenLabs text-to-speech helper.
 *
 * Wraps the v1 SDK's streaming generator into a single Buffer so callers can
 * either write the audio to disk, return it from an HTTP handler, or upload it
 * to an asset store for Twilio playback.
 */
export class ElevenLabsTtsClient {
  private readonly client: ElevenLabsClient;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("ElevenLabs API key is required");
    this.client = new ElevenLabsClient({ apiKey });
  }

  async synthesize(text: string, options: ElevenLabsTtsOptions): Promise<ElevenLabsTtsResult> {
    if (!options.voiceId) throw new Error("voiceId is required for ElevenLabs TTS");
    const stream = await this.client.generate({
      voice: options.voiceId,
      text,
      model_id: options.modelId ?? "eleven_turbo_v2",
      voice_settings: {
        stability: clampUnit(options.stability ?? 0.5),
        similarity_boost: clampUnit(options.similarity ?? 0.75),
      },
    });

    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return {
      audio: Buffer.concat(chunks),
      contentType: "audio/mpeg",
    };
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function createElevenLabsClient(apiKey: string): ElevenLabsTtsClient {
  return new ElevenLabsTtsClient(apiKey);
}
