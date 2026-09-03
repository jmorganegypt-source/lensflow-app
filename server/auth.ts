// Real, standalone email/password authentication. This replaces the
// Manus-platform-only OAuth login that this exported codebase referenced
// (client/src/const.ts's old startLogin(), server/_core/oauth.ts,
// server/_core/sdk.ts) but never actually had a working client half for —
// that flow redirects to a Manus-hosted login portal tied to an appId only
// Manus issues, so it can't work once this app is deployed off Manus's own
// platform. This module has no dependency on any third party: it's a
// scrypt password hash plus a signed session cookie, both self-contained.
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SESSION_TTL = "180d";
/** Keep this in sync with SESSION_TTL above — used for the session cookie's maxAge, which jose's string-based TTL can't hand back directly. */
export const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180;

/** Generates a per-user unique id for the `users.openId` column, decoupled from any external identity provider. */
export function generateLocalOpenId(): string {
  return `local_${randomUUID()}`;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  const storedBuffer = Buffer.from(hashHex, "hex");
  if (storedBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(derivedKey, storedBuffer);
}

function getSecretKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is not configured — set it to a long random string before accepting logins");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecretKey());
}

/** Returns the user id encoded in a session cookie, or null if missing/invalid/expired. */
export async function verifySessionToken(token: string | undefined | null): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const uid = payload.uid;
    return typeof uid === "number" ? uid : null;
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}
