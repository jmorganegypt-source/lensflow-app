import { describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, isValidEmail, normalizeEmail, verifyPassword, verifySessionToken } from "./auth";

// JWT_SECRET is set in vitest.config.ts's test.env, before this module (and
// the server/_core/env.ts it depends on) is even imported.

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("salts each hash uniquely, even for the same password", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("rejects a missing/empty stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", undefined)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips a user id through a signed token", async () => {
    const token = await createSessionToken(42);
    expect(await verifySessionToken(token)).toBe(42);
  });

  it("rejects garbage, missing, or tampered tokens", async () => {
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken(null)).toBeNull();
    const token = await createSessionToken(1);
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
  });
});

describe("email helpers", () => {
  it("validates well-formed emails only", () => {
    expect(isValidEmail("john@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@tld")).toBe(false);
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeEmail("  John@Example.COM  ")).toBe("john@example.com");
  });
});
