import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // ENV (server/_core/env.ts) reads process.env once at module-load time,
    // which happens before any per-test beforeAll hook runs — so anything
    // that needs a non-empty JWT_SECRET (server/auth.ts's session signing)
    // has to have it set here, before the test files import that module.
    env: {
      JWT_SECRET: "test_secret_do_not_use_in_production_1234567890",
    },
  },
});
