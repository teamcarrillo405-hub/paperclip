import { createClient, type DeepgramClient } from "@deepgram/sdk";
import type {
  DeepgramTranscriptionOptions,
  DeepgramTranscriptionResult,
} from "./types.js";

/**
 * Deepgram streaming transcription helper.
 *
 * Two modes are exposed:
 *   - `transcribeUrl`: fetch a single-utterance transcript for a recorded
 *     audio URL (used for voicemail post-processing).
 *   - `openLiveStream`: open a live WebSocket connection for real-time
 *     transcription of a Twilio media stream.
 */
export class DeepgramStreamClient {
  private readonly client: DeepgramClient;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("Deepgram API key is required");
    this.client = createClient(apiKey);
  }

  async transcribeUrl(
    url: string,
    options: DeepgramTranscriptionOptions = {},
  ): Promise<DeepgramTranscriptionResult> {
    const params = {
      model: options.model ?? "nova-2",
      language: options.language ?? "en",
      punctuate: options.punctuate ?? true,
      smart_format: options.smartFormat ?? true,
    };
    const response = await this.client.listen.prerecorded.transcribeUrl({ url }, params);
    const raw = (response as { result?: unknown }).result ?? response;
    const result = raw as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{ transcript?: string; confidence?: number }>;
        }>;
      };
    };
    const alt = result.results?.channels?.[0]?.alternatives?.[0];
    return {
      transcript: alt?.transcript ?? "",
      confidence: alt?.confidence,
      raw,
    };
  }

  async transcribeBuffer(
    buffer: Buffer,
    options: DeepgramTranscriptionOptions = {},
  ): Promise<DeepgramTranscriptionResult> {
    const params = {
      model: options.model ?? "nova-2",
      language: options.language ?? "en",
      punctuate: options.punctuate ?? true,
      smart_format: options.smartFormat ?? true,
    };
    const response = await this.client.listen.prerecorded.transcribeFile(buffer, params);
    const raw = (response as { result?: unknown }).result ?? response;
    const result = raw as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{ transcript?: string; confidence?: number }>;
        }>;
      };
    };
    const alt = result.results?.channels?.[0]?.alternatives?.[0];
    return {
      transcript: alt?.transcript ?? "",
      confidence: alt?.confidence,
      raw,
    };
  }

  openLiveStream(options: DeepgramTranscriptionOptions = {}): unknown {
    const params: Record<string, unknown> = {
      model: options.model ?? "nova-2",
      language: options.language ?? "en",
      punctuate: options.punctuate ?? true,
      smart_format: options.smartFormat ?? true,
      encoding: "mulaw",
      sample_rate: 8000,
    };
    return this.client.listen.live(params);
  }
}

export function createDeepgramClient(apiKey: string): DeepgramStreamClient {
  return new DeepgramStreamClient(apiKey);
}
