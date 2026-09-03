/**
 * Seeds the real LensFlow "Fantasy Rooms" catalogue: 5 room sets, each offered
 * across the 4 live package tiers (Spark/Heat/Peak/Marathon), matching what is
 * already published on lensflow.com.au/creator.
 *
 * Run once the app is deployed with a real DATABASE_URL and OWNER_EMAIL:
 *   npx tsx server/seed.ts
 *
 * Safe to re-run: it skips any room whose title already exists for the owner.
 */
import { and, eq } from "drizzle-orm";
import { creatorRooms } from "../drizzle/schema";
import { getDb, getUserByEmail } from "./db";
import { ENV } from "./_core/env";

const ROOMS = [
  { title: "The Bedroom", roomType: "human" as const, description: "Warm, intimate — face or full stage. Silk, tall lamp, slow light. A high-end set, never a messy real room." },
  { title: "The Dungeon", roomType: "human" as const, description: "Dark, command, deliberate. The BDSM room." },
  { title: "Mirror Suite", roomType: "avatar" as const, description: "Dual presence, paid pair energy. AI avatar room." },
  { title: "Private Directive", roomType: "human" as const, description: "Voice-led, tempo, command. The JOI room." },
  { title: "Velvet Lounge", roomType: "human" as const, description: "Slow, close, addictive." },
];

const PACKAGES = [
  { label: "Spark", durationMinutes: 5, priceCents: 1000, note: "Quick session" },
  { label: "Heat", durationMinutes: 10, priceCents: 1950, note: "Most popular" },
  { label: "Peak", durationMinutes: 20, priceCents: 3500, note: "Extended" },
  { label: "Marathon", durationMinutes: 40, priceCents: 5000, note: "Full experience" },
];

async function main() {
  if (!ENV.databaseUrl) throw new Error("DATABASE_URL is not set — run this against a real deployment, not locally.");
  if (!ENV.ownerEmail) throw new Error("OWNER_EMAIL is not set — the seed needs to know which account owns these rooms.");

  const owner = await getUserByEmail(ENV.ownerEmail);
  if (!owner) throw new Error("No user found for OWNER_EMAIL yet — register that account at /login once first so it exists, then re-run this.");

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  let created = 0;
  let skipped = 0;

  for (const room of ROOMS) {
    for (const pkg of PACKAGES) {
      const title = `${room.title} · ${pkg.label}`;
      const existing = await db.select().from(creatorRooms).where(and(eq(creatorRooms.creatorId, owner.id), eq(creatorRooms.title, title))).limit(1);
      if (existing[0]) {
        skipped++;
        continue;
      }
      await db.insert(creatorRooms).values({
        creatorId: owner.id,
        title,
        description: `${room.description} ${pkg.note} — ${pkg.durationMinutes} min.`,
        roomType: room.roomType,
        packageLabel: pkg.label,
        durationMinutes: pkg.durationMinutes,
        capacity: 1,
        priceCents: pkg.priceCents,
        currency: "AUD",
        status: "published",
      });
      created++;
    }
  }

  console.log(`Seed complete: ${created} room created, ${skipped} already existed.`);
  console.log("Remember: publishing a room only creates the template. Add real open time slots for each one from the Creator Desk before fans can book them.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("[Seed] Failed:", error);
    process.exit(1);
  });
