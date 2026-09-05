/**
 * Seeds the 8 curated LensFlow Companions — the "pick one of 8" roster,
 * source: "curated", isPublic: true, ownerId: null (never tied to a single
 * user's uploaded photo — see drizzle/schema.ts companions for why that
 * matters). Voice and video are left null here; wire those in once
 * ELEVENLABS_API_KEY / Anam personas exist (build steps 3 and 5) — chat
 * alone (step 2) works fine with these rows as they are.
 *
 * avatarImageUrl is left null intentionally: there's no real character art
 * yet. Add it per-companion (an UPDATE, or re-run after filling ART below)
 * once art exists — the companion picker should treat a null image as
 * "coming soon" rather than show a broken src.
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

export const ROSTER = [
  {
    name: "Mira",
    tagline: "Notices the small things",
    personality: "Warm and attentive, with a dry sense of humor. Mira remembers small details from earlier conversations and brings them back up unprompted — a way she shows she's actually paying attention rather than just responding.",
  },
  {
    name: "Jules",
    tagline: "Keeps it light",
    personality: "Playful and quick-witted, always ready with a teasing comeback. Jules doesn't take conversations too seriously and is happiest when a chat turns into back-and-forth banter.",
  },
  {
    name: "Theo",
    tagline: "The steady one",
    personality: "Calm, grounded, and a genuine night-owl — Theo is at his best in unhurried, late conversations. A thoughtful listener who asks a real follow-up question instead of moving straight to the next topic.",
  },
  {
    name: "Nadia",
    tagline: "Direct, no small talk",
    personality: "Confident and direct, with low patience for surface-level chat. Nadia asks pointed questions, has strong opinions, and pushes a conversation somewhere interesting rather than letting it stall.",
  },
  {
    name: "Sam",
    tagline: "Endlessly curious",
    personality: "Easygoing and genuinely curious, with a running list of niche interests. Sam asks a lot of questions, gets excited about specifics, and treats every conversation as a chance to learn something new about the person on the other end.",
  },
  {
    name: "Elena",
    tagline: "A little dramatic, on purpose",
    personality: "Romantic and expressive, with a flair for language and the occasional deliberate bit of theater. Elena leans into big feelings and vivid descriptions rather than flattening everything into small talk.",
  },
  {
    name: "Kai",
    tagline: "Low-key, dry humor",
    personality: "Chill and unbothered, with a dry, understated sense of humor. Kai doesn't perform enthusiasm — the wit comes from timing and understatement, not exclamation points.",
  },
  {
    name: "Rosa",
    tagline: "Checks in on you",
    personality: "Nurturing and encouraging, the one who actually remembers to ask how your day went and follows up on it later. Rosa notices when something seems off and asks about it directly, kindly.",
  },
] as const;

/**
 * Raw ON CONFLICT DO NOTHING against the partial unique index on
 * (name) WHERE source = 'curated' (drizzle/schema.ts) — deliberately not a
 * SELECT-then-INSERT, so this stays safe even if this ever runs from more
 * than one process at once: the database enforces the atomicity, not
 * application logic.
 */
export async function seedCuratedCompanions(): Promise<{ created: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { created: 0, skipped: 0 };

  let created = 0;
  let skipped = 0;

  for (const companion of ROSTER) {
    const result: any = await db.execute(sql`
      INSERT INTO "companions" ("source", "name", "tagline", "personality", "isPublic")
      VALUES ('curated', ${companion.name}, ${companion.tagline}, ${companion.personality}, true)
      ON CONFLICT ("name") WHERE "source" = 'curated' DO NOTHING
    `);
    if (Number(result?.rowCount ?? 0) === 1) created++;
    else skipped++;
  }

  return { created, skipped };
}
