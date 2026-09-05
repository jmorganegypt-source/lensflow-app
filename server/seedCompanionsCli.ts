/**
 * Standalone CLI entrypoint for seedCuratedCompanions() — for re-seeding by
 * hand if you ever need to. Not imported by server/_core/index.ts (which is
 * what the production build actually bundles), so this file's top-level
 * code never runs as a side effect of booting the server. Same pattern as
 * server/seed.ts.
 *
 *   npx tsx server/seedCompanionsCli.ts
 */
import { ENV } from "./_core/env";
import { seedCuratedCompanions } from "./seedCompanions";

async function main() {
  if (!ENV.databaseUrl) throw new Error("DATABASE_URL is not set — run this against a real deployment, not locally.");
  const { created, updated } = await seedCuratedCompanions();
  console.log(`Seed complete: ${created} companion(s) created, ${updated} updated.`);
  console.log("Reminder: avatarImageUrl is still null on every row — the picker shows a \"coming soon\" placeholder until real art is attached.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("[SeedCompanions] Failed:", error);
    process.exit(1);
  });
