/**
 * Seeds the 8 curated LensFlow Companions — the "pick one of 8" roster,
 * source: "curated", isPublic: true, ownerId: null (never tied to a single
 * user's uploaded photo — see drizzle/schema.ts companions for why that
 * matters). Each has an elevenlabsVoiceId so voice works once
 * ELEVENLABS_API_KEY is set; anamPersonaId is still null (Anam video isn't
 * a finished integration — see server/anam.ts).
 *
 * avatarImageUrl is left null intentionally: there's no real character art
 * yet — the picker shows a "coming soon" placeholder rather than a broken
 * src. Set it per-companion once art exists (the upsert below leaves that
 * column and anamPersonaId untouched, so a manual UPDATE survives redeploys).
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

// voiceId values are ElevenLabs' standard shared library voices (available
// to every account) — a sensible default so voice works out of the box.
// Swap any of these for a custom/cloned voice from your ElevenLabs account
// (Voices page → the voice's ID) and it'll sync on the next deploy.
export const ROSTER = [
  {
    name: "Mira",
    tagline: "Notices the small things",
    personality: "Warm and attentive, with a dry sense of humor. Mira remembers small details from earlier conversations and brings them back up unprompted — a way she shows she's actually paying attention rather than just responding.",
    voiceId: "EXAVITQu4vr4xnSDxMaL", // Sarah — soft, warm
  },
  {
    name: "Jules",
    tagline: "Keeps it light",
    personality: "Playful and quick-witted, always ready with a teasing comeback. Jules doesn't take conversations too seriously and is happiest when a chat turns into back-and-forth banter.",
    voiceId: "9BWtsMINqrJLrRacOk9x", // Aria — expressive
  },
  {
    name: "Theo",
    tagline: "The steady one",
    personality: "Calm, grounded, and a genuine night-owl — Theo is at his best in unhurried, late conversations. A thoughtful listener who asks a real follow-up question instead of moving straight to the next topic.",
    voiceId: "JBFqnCBsd6RMkjVDRZzb", // George — warm, mature
  },
  {
    name: "Nadia",
    tagline: "Direct, no small talk",
    personality: "Confident and direct, with low patience for surface-level chat. Nadia asks pointed questions, has strong opinions, and pushes a conversation somewhere interesting rather than letting it stall.",
    voiceId: "Xb7hH8MSUJpSbSDYk0k2", // Alice — confident
  },
  {
    name: "Sam",
    tagline: "Endlessly curious",
    personality: "Easygoing and genuinely curious, with a running list of niche interests. Sam asks a lot of questions, gets excited about specifics, and treats every conversation as a chance to learn something new about the person on the other end.",
    voiceId: "bIHbv24MWmeRgasZH58o", // Will — friendly
  },
  {
    name: "Elena",
    tagline: "A little dramatic, on purpose",
    personality: "Romantic and expressive, with a flair for language and the occasional deliberate bit of theater. Elena leans into big feelings and vivid descriptions rather than flattening everything into small talk.",
    voiceId: "FGY2WhTYpPnrIDTdsKH5", // Laura — upbeat
  },
  {
    name: "Kai",
    tagline: "Low-key, dry humor",
    personality: "Chill and unbothered, with a dry, understated sense of humor. Kai doesn't perform enthusiasm — the wit comes from timing and understatement, not exclamation points.",
    voiceId: "cjVigY5qzO86Huf0OWal", // Eric — laid-back
  },
  {
    name: "Rosa",
    tagline: "Checks in on you",
    personality: "Nurturing and encouraging, the one who actually remembers to ask how your day went and follows up on it later. Rosa notices when something seems off and asks about it directly, kindly.",
    voiceId: "pFZP5JQG7iQjIQuC4Bku", // Lily — warm
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
      INSERT INTO "companions" ("source", "name", "tagline", "personality", "elevenlabsVoiceId", "isPublic")
      VALUES ('curated', ${companion.name}, ${companion.tagline}, ${companion.personality}, ${companion.voiceId}, true)
      ON CONFLICT ("name") WHERE "source" = 'curated'
      DO UPDATE SET
        "tagline" = EXCLUDED."tagline",
        "personality" = EXCLUDED."personality",
        "elevenlabsVoiceId" = EXCLUDED."elevenlabsVoiceId",
        "updatedAt" = now()
      RETURNING (xmax = 0) AS inserted
    `);
    const row = result?.rows?.[0];
    if (row?.inserted) created++;
    else updated++;
  }

  return { created, updated };
}
