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
 * Run once the app is deployed with a real DATABASE_URL:
 *   npx tsx server/seedCompanions.ts
 *
 * Safe to re-run: it skips any companion whose name already exists.
 */
import { and, eq } from "drizzle-orm";
import { companions } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const ROSTER = [
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

async function main() {
  if (!ENV.databaseUrl) throw new Error("DATABASE_URL is not set — run this against a real deployment, not locally.");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  let created = 0;
  let skipped = 0;

  for (const companion of ROSTER) {
    const existing = await db.select().from(companions).where(and(eq(companions.name, companion.name), eq(companions.source, "curated"))).limit(1);
    if (existing[0]) {
      skipped++;
      continue;
    }
    await db.insert(companions).values({
      source: "curated",
      name: companion.name,
      tagline: companion.tagline,
      personality: companion.personality,
      isPublic: true,
    });
    created++;
  }

  console.log(`Seed complete: ${created} companion(s) created, ${skipped} already existed.`);
  console.log("Reminder: avatarImageUrl and elevenlabsVoiceId are still null on every row — the picker should show these as \"coming soon\" until real art and voices are attached.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("[SeedCompanions] Failed:", error);
    process.exit(1);
  });
