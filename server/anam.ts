// Real-time video avatar for Companions, via Anam (anam.ai). Thin fetch
// wrapper, same "no SDK on the server" shape as coinbase.ts/elevenlabs.ts.
//
// Architecture: the companion's brain stays here (server/companions.ts —
// Claude + persistent memory). Anam is only the rendering layer. We mint a
// session with llmId "CUSTOMER_CLIENT_V1" ("Disable LLM"), so Anam does the
// talking-head video + TTS but never runs its own model — the client feeds
// it our Claude reply text via the JS SDK's talk stream. That keeps memory,
// personality, and safety exactly where they already are.
import { ENV } from "./_core/env";

const ANAM_API_BASE = "https://api.anam.ai/v1";
// Anam's built-in "Disable LLM" mode — the client supplies the text.
const CLIENT_SIDE_LLM_ID = "CUSTOMER_CLIENT_V1";

/**
 * Exchanges the server-side API key for a short-lived session token the
 * browser SDK uses to open the WebRTC video stream. avatarId + voiceId come
 * from the companion row (seeded from Anam's stock library — see
 * server/seedCompanions.ts).
 */
export async function createAnamSessionToken(input: { name: string; avatarId: string; voiceId: string }): Promise<string> {
  if (!ENV.anamApiKey) throw new Error("Companion video is not configured — set ANAM_API_KEY");
  const response = await fetch(`${ANAM_API_BASE}/auth/session-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.anamApiKey}`,
    },
    body: JSON.stringify({
      personaConfig: {
        name: input.name,
        avatarId: input.avatarId,
        voiceId: input.voiceId,
        llmId: CLIENT_SIDE_LLM_ID,
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Anam session-token request failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const json: any = await response.json();
  const token = json?.sessionToken;
  if (typeof token !== "string") throw new Error("Anam returned an unexpected session-token response shape");
  return token;
}
