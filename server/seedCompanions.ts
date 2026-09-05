/**
 * Seeds the 8 curated LensFlow Companions — the "pick one of 8" roster,
 * source: "curated", isPublic: true, ownerId: null (never tied to a single
 * user's uploaded photo — see drizzle/schema.ts companions for why that
 * matters). Each has an elevenlabsVoiceId (text-chat voice) and an
 * anamAvatarId + anamVoiceId (video mode) — see server/anam.ts.
 *
 * avatarImageUrl points at self-hosted portraits in client/public/companions/
 * (user-supplied, AI-generated — not real people). The Anam video avatars
 * are separate stock characters and won't match the card photo. anamPersonaId
 * is left untouched by the upsert (unused — we pass avatar+voice inline).
 *
 * seedCuratedCompanions() runs automatically on every boot (see
 * server/_core/index.ts, right after migrations) — it's idempotent, so
 * there's no manual step needed on a fresh deploy.
 *
 * IMPORTANT: this file must never contain a top-level "am I being run
 * directly?" self-execution check (e.g. comparing import.meta.url to
 * process.argv[1]). server/_core/index.ts is bundled by esbuild into one
 * file for production (see the build command in package.json) — bundling
 * collapses every module's import.meta.url to the bundle's own URL, so a
 * self-execution check that works in dev evaluates true for every module
 * in production and fires at import time, before migrations even run.
 * That exact bug shipped once already: it ran this file's old standalone
 * main() (which called process.exit(1) on any error) inside the live web
 * server, crashing the whole deploy. The CLI entrypoint lives in
 * server/seedCompanionsCli.ts instead — a separate file the server bundle
 * never imports, the same way server/seed.ts already isn't imported by it.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

// voiceId  → ElevenLabs shared-library voice (text chat's "Play voice").
// anamAvatarId / anamVoiceId → Anam stock avatar + voice (video mode) —
//            all female, but they won't match the card photos below.
// image    → the picker-card portrait, self-hosted in client/public/companions/
//            (user-supplied AI-generated portraits, not real people).
// All are swappable: edit here and it syncs to existing rows on next deploy.
export const ROSTER = [
  {
    name: "Mira",
    tagline: "Notices the small things",
    personality: "Warm and attentive, with a dry sense of humor. Mira remembers small details from earlier conversations and brings them back up unprompted — a way she shows she's actually paying attention rather than just responding.",
    voiceId: "EXAVITQu4vr4xnSDxMaL", // ElevenLabs: Sarah — soft, warm
    anamAvatarId: "8e10e484-96f7-4d73-a43e-0cb09e4cb372", // Anam: Claire
    anamVoiceId: "90313ddc-4fc0-11f1-84b0-52bacf74fa75", // Anam: Amanda — Warm Guide
    image: "/companions/mira.jpg",
  },
  {
    name: "Jules",
    tagline: "Keeps it light",
    personality: "Playful and quick-witted, always ready with a teasing comeback. Jules doesn't take conversations too seriously and is happiest when a chat turns into back-and-forth banter.",
    voiceId: "9BWtsMINqrJLrRacOk9x", // ElevenLabs: Aria — expressive
    anamAvatarId: "071b0286-4cce-4808-bee2-e642f1062de3", // Anam: Liv (home)
    anamVoiceId: "de23e340-1416-4dd8-977d-065a7ca11697", // Anam: Lucy — Fresh & Casual
    image: "/companions/jules.jpg",
  },
  {
    name: "Theo",
    tagline: "The steady one",
    personality: "Calm, grounded, and a genuine night-owl — Theo is at her best in unhurried, late conversations. A thoughtful listener who asks a real follow-up question instead of moving straight to the next topic.",
    voiceId: "XrExE9yKIg1WjnnlVkGX", // ElevenLabs: Matilda — warm
    anamAvatarId: "edf6fdcb-acab-44b8-b974-ded72665ee26", // Anam: Mia (studio)
    anamVoiceId: "9173c0ac-4fc0-11f1-84b0-52bacf74fa75", // Anam: Cindy
    image: "/companions/theo.jpg",
  },
  {
    name: "Nadia",
    tagline: "Direct, no small talk",
    personality: "Confident and direct, with low patience for surface-level chat. Nadia asks pointed questions, has strong opinions, and pushes a conversation somewhere interesting rather than letting it stall.",
    voiceId: "Xb7hH8MSUJpSbSDYk0k2", // ElevenLabs: Alice — confident
    anamAvatarId: "3bd2498a-61dc-4e67-87b4-62c798f649ca", // Anam: SONIA
    anamVoiceId: "c48ee44f-5050-11f1-9076-5e955d484d11", // Anam: Gemma — Decisive Agent
    image: "/companions/nadia.jpg",
  },
  {
    name: "Sam",
    tagline: "Endlessly curious",
    personality: "Easygoing and genuinely curious, with a running list of niche interests. Sam asks a lot of questions, gets excited about specifics, and treats every conversation as a chance to learn something new about the person on the other end.",
    voiceId: "cgSgspJ2msm6clmCkdW9", // ElevenLabs: Jessica — friendly
    anamAvatarId: "6dbc1e47-7768-403e-878a-94d7fcc3677b", // Anam: Sophie (sofa)
    anamVoiceId: "90313ddc-4fc0-11f1-84b0-52bacf74fa75", // Anam: Amanda — Warm Guide
    image: "/companions/sam.jpg",
  },
  {
    name: "Elena",
    tagline: "A little dramatic, on purpose",
    personality: "Romantic and expressive, with a flair for language and the occasional deliberate bit of theater. Elena leans into big feelings and vivid descriptions rather than flattening everything into small talk.",
    voiceId: "FGY2WhTYpPnrIDTdsKH5", // ElevenLabs: Laura — upbeat
    anamAvatarId: "dc9aa3e1-32f2-499e-9921-ecabac1076fc", // Anam: Bella (sofa)
    anamVoiceId: "90a1acd3-4fc0-11f1-84b0-52bacf74fa75", // Anam: Rachel — Polished Presence
    image: "/companions/elena.jpg",
  },
  {
    name: "Kai",
    tagline: "Low-key, dry humor",
    personality: "Chill and unbothered, with a dry, understated sense of humor. Kai doesn't perform enthusiasm — the wit comes from timing and understatement, not exclamation points.",
    voiceId: "XB0fDUnXU5powFXDhCwa", // ElevenLabs: Charlotte — relaxed
    anamAvatarId: "edf6fdcb-acab-44b8-b974-ded72665ee26", // Anam: Mia (studio)
    anamVoiceId: "90a1acd3-4fc0-11f1-84b0-52bacf74fa75", // Anam: Rachel — Polished Presence
    image: "/companions/kai.jpg",
  },
  {
    name: "Rosa",
    tagline: "Checks in on you",
    personality: "Nurturing and encouraging, the one who actually remembers to ask how your day went and follows up on it later. Rosa notices when something seems off and asks about it directly, kindly.",
    voiceId: "pFZP5JQG7iQjIQuC4Bku", // ElevenLabs: Lily — warm
    anamAvatarId: "27e12daa-50fc-4384-93c2-ebca73f1f78d", // Anam: Anne (home)
    anamVoiceId: "90919e2e-4fc0-11f1-84b0-52bacf74fa75", // Anam: Michelle — Empathetic Voice
    image: "/companions/rosa.jpg",
  },
  {
    name: "Sophie",
    tagline: "The quiet observer",
    personality: "Perceptive and a little reserved. Sophie listens more than she talks, then says the one thing that reframes the whole conversation. She notices patterns in what you tell her.",
    voiceId: "EXAVITQu4vr4xnSDxMaL", // ElevenLabs: Sarah — soft, warm
    anamAvatarId: "dc9aa3e1-32f2-499e-9921-ecabac1076fc", // Anam: Bella (sofa)
    anamVoiceId: "90a1acd3-4fc0-11f1-84b0-52bacf74fa75", // Anam: Rachel — Polished Presence
    image: "/companions/sophie.jpg",
  },
  {
    name: "Jess",
    tagline: "Always up for something",
    personality: "High-energy and spontaneous. Jess turns an ordinary evening into an occasion — she's the one nudging you to do the thing instead of talking about it. A little indulgent, never boring.",
    voiceId: "9BWtsMINqrJLrRacOk9x", // ElevenLabs: Aria — expressive
    anamAvatarId: "3bd2498a-61dc-4e67-87b4-62c798f649ca", // Anam: SONIA
    anamVoiceId: "c48ee44f-5050-11f1-9076-5e955d484d11", // Anam: Gemma — Decisive Agent
    image: "/companions/jess.jpg",
  },
  {
    name: "Ava",
    tagline: "A soft landing",
    personality: "Calm and unhurried — the one you talk to when you want to decompress. Ava doesn't rush to fix things; she just makes the end of a long day feel lighter.",
    voiceId: "FGY2WhTYpPnrIDTdsKH5", // ElevenLabs: Laura — upbeat
    anamAvatarId: "27e12daa-50fc-4384-93c2-ebca73f1f78d", // Anam: Anne (home)
    anamVoiceId: "90313ddc-4fc0-11f1-84b0-52bacf74fa75", // Anam: Amanda — Warm Guide
    image: "/companions/ava.jpg",
  },
] as const;

/**
 * Upsert against the partial unique index on (name) WHERE source = 'curated'
 * (drizzle/schema.ts) — deliberately not a SELECT-then-INSERT, so this stays
 * safe even if it ever runs from more than one process at once: the database
 * enforces the atomicity, not application logic.
 *
 * ON CONFLICT DO UPDATE (not DO NOTHING) so edits to ROSTER — a reworded
 * personality, a swapped voiceId — propagate to existing rows on the next
 * deploy. Only the ROSTER-owned columns are touched; avatarImageUrl and
 * anamPersonaId are left alone in case they've been set out of band.
 */
export async function seedCuratedCompanions(): Promise<{ created: number; updated: number }> {
  const db = await getDb();
  if (!db) return { created: 0, updated: 0 };

  let created = 0;
  let updated = 0;

  for (const companion of ROSTER) {
    const result: any = await db.execute(sql`
      INSERT INTO "companions" ("source", "name", "tagline", "personality", "avatarImageUrl", "elevenlabsVoiceId", "anamAvatarId", "anamVoiceId", "isPublic")
      VALUES ('curated', ${companion.name}, ${companion.tagline}, ${companion.personality}, ${companion.image}, ${companion.voiceId}, ${companion.anamAvatarId}, ${companion.anamVoiceId}, true)
      ON CONFLICT ("name") WHERE "source" = 'curated'
      DO UPDATE SET
        "tagline" = EXCLUDED."tagline",
        "personality" = EXCLUDED."personality",
        "avatarImageUrl" = EXCLUDED."avatarImageUrl",
        "elevenlabsVoiceId" = EXCLUDED."elevenlabsVoiceId",
        "anamAvatarId" = EXCLUDED."anamAvatarId",
        "anamVoiceId" = EXCLUDED."anamVoiceId",
        "updatedAt" = now()
      RETURNING (xmax = 0) AS inserted
    `);
    const row = result?.rows?.[0];
    if (row?.inserted) created++;
    else updated++;
  }

  return { created, updated };
}
