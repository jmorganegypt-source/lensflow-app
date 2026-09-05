// Thin wrapper over ElevenLabs' text-to-speech REST API — same "no SDK,
// one fetch call" shape as server/coinbase.ts and server/companions.ts.
import { ENV } from "./_core/env";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

/** Synthesizes `text` in the given ElevenLabs voice and returns the raw MP3 bytes. */
export async function synthesizeSpeech(voiceId: string, text: string): Promise<Buffer> {
  if (!ENV.elevenlabsApiKey) throw new Error("Companion voice is not configured — set ELEVENLABS_API_KEY");
  const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ENV.elevenlabsApiKey,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ElevenLabs speech synthesis failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
