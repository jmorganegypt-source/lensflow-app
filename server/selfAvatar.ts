// Liveness verification for self-avatars. This is the one gate between "a
// companion built from your own photo" and "a companion built from
// anyone's photo" (see drizzle/schema.ts companions / selfAvatarVerifications
// for why that distinction is load-bearing, not cosmetic — it's the whole
// reason self_avatar companions are allowed to exist at all).
//
// No vendor is wired in yet, deliberately. This throws until one is chosen
// and implemented below, rather than silently accepting an unverified
// image — fail closed, not open. A half-finished liveness check that
// sometimes passes a photo of someone else is worse than no self-avatar
// feature at all.
//
// To wire a real vendor: AWS Rekognition Face Liveness, Persona, or Onfido
// are the standard choices. Each works the same shape — the client runs a
// short guided capture session (head-turn/blink prompts) through the
// vendor's own SDK, which returns a session reference, and this function
// exchanges that reference server-side for a pass/fail result plus the
// captured frame. A single static photo upload can NEVER be a liveness
// check on its own — it's just an image, and a photo of a photo (or of
// someone else entirely) passes it trivially. Don't build around that
// shortcut even under deadline pressure.
export type LivenessResult = { passed: boolean; imageUrl: string; provider: string };

export async function verifyLiveness(sessionReference: string): Promise<LivenessResult> {
  throw new Error(
    "Self-avatar liveness verification is not configured yet — this needs a real vendor (AWS Rekognition Face " +
      "Liveness, Persona, or Onfido) wired in here before self-avatar companions can be created. See the comment " +
      "at the top of server/selfAvatar.ts. Do not bypass this with a plain photo upload."
  );
}
