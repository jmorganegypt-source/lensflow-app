// Real-time video avatar for Companions, via Anam (anam.ai) — lip-syncs a
// companion's text reply to a talking-head video of its avatarImageUrl.
//
// Genuinely not wired up yet: no ANAM_API_KEY is configured, and the exact
// session-creation request/response shape below should be confirmed against
// Anam's current docs before this is called for real — treat this as the
// integration point (where a companion's session token gets minted) rather
// than a verified API contract. The general pattern across this class of
// vendor (Anam, D-ID, HeyGen, Beyond Presence) is: create a persona once per
// companion from its avatar image + voice, then issue a short-lived session
// token per chat that a client-side SDK uses to open the video stream.
import { ENV } from "./_core/env";

export async function createAnamSessionToken(personaId: string): Promise<string> {
  if (!ENV.anamApiKey) throw new Error("Companion video is not configured — set ANAM_API_KEY");
  throw new Error("ANAM_API_KEY is set, but the actual session-creation call still isn't implemented — confirm the request/response shape against Anam's current docs and replace this throw in server/anam.ts");
}
