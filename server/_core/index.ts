import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { handleStripeWebhook } from "../stripeWebhook";
import { handleCoinbaseWebhook } from "../coinbaseWebhook";
import { getDb } from "../db";
import { seedCuratedCompanions } from "../seedCompanions";

// Applies any pending Drizzle migrations on boot, so a fresh Postgres
// database (e.g. right after connecting a new Render database, or in any
// environment where nobody has run `pnpm db:push` by hand) gets its schema
// created automatically instead of every query failing with "relation
// does not exist". Safe to run on every boot — Drizzle tracks which
// migrations already applied and skips them.
async function runMigrations() {
  const db = await getDb();
  if (!db) {
    console.warn("[Migrate] DATABASE_URL not set — skipping migrations.");
    return;
  }
  // Resolve the migrations folder relative to both plausible run modes:
  // `node dist/index.js` (production, bundled) and `tsx server/_core/index.ts`
  // (local dev) land at different __dirname depths, and Render's working
  // directory for the start command isn't guaranteed either — so try a
  // couple of candidates and use whichever actually has the migration
  // journal, rather than assuming one layout.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "drizzle"),
    path.join(__dirname, "..", "drizzle"),
    path.join(__dirname, "..", "..", "drizzle"),
  ];
  const migrationsFolder = candidates.find(candidate => fs.existsSync(path.join(candidate, "meta", "_journal.json")));
  if (!migrationsFolder) {
    console.error("[Migrate] Could not locate drizzle/meta/_journal.json in any of:", candidates);
    return;
  }
  try {
    await migrate(db, { migrationsFolder });
    console.log("[Migrate] Database schema is up to date.");
  } catch (error) {
    console.error("[Migrate] Failed to apply migrations:", error);
    return;
  }

  // Idempotent — skips any companion whose name already exists — so this
  // is safe to run on every boot rather than needing a manual one-off
  // command against production (see server/seedCompanions.ts).
  try {
    const { created, skipped } = await seedCuratedCompanions();
    if (created > 0) console.log(`[Seed] Created ${created} curated companion(s), ${skipped} already existed.`);
  } catch (error) {
    console.error("[Seed] Failed to seed curated companions (non-fatal):", error);
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  await runMigrations();

  const app = express();
  const server = createServer(app);
  // Stripe (and Coinbase Commerce, below) must receive the raw request body
  // before any JSON parser runs, or their signature checks fail.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
  app.post("/api/coinbase/webhook", express.raw({ type: "application/json" }), handleCoinbaseWebhook);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  // Login/register/logout are plain tRPC mutations now (see server/routers.ts
  // `auth` router) — no OAuth redirect dance, no callback route needed.
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
