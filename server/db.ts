import { and, asc, desc, eq, lt, gt, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { bookings, coinbaseEvents, creatorProfiles, creatorRooms, InsertUser, roomSlots, stripeEvents, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { generateLocalOpenId } from "./auth";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Render's managed Postgres (and most hosted Postgres providers)
      // terminate TLS with a cert that isn't in Node's default trust store
      // when connecting from outside their own network — rejectUnauthorized
      // is disabled the same way Render's own docs/examples do it. This is
      // still an encrypted connection, just not certificate-pinned.
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= new Date();
  // Postgres has no ON UPDATE clause (unlike the mysqlTable this was written
  // against) — bump it explicitly so it means the same thing here.
  updateSet.updatedAt = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

/** Creates a locally-registered (email/password) user. Throws if the email is already taken. */
export async function createLocalUser(input: { email: string; name: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await getUserByEmail(input.email);
  if (existing) throw new Error("An account with that email already exists");
  const role: "admin" | "user" = input.email.toLowerCase() === ENV.ownerEmail && ENV.ownerEmail ? "admin" : "user";
  const [inserted] = await db.insert(users).values({
    openId: generateLocalOpenId(),
    email: input.email,
    name: input.name,
    passwordHash: input.passwordHash,
    loginMethod: "password",
    role,
    lastSignedIn: new Date(),
  }).returning({ id: users.id });
  return getUserById(inserted.id);
}

export async function listPublishedRooms() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(creatorRooms).where(eq(creatorRooms.status, "published")).orderBy(asc(creatorRooms.createdAt));
}

export async function getRoomWithSlots(roomId: number) {
  const db = await getDb();
  if (!db) return null;
  const rooms = await db.select().from(creatorRooms).where(and(eq(creatorRooms.id, roomId), eq(creatorRooms.status, "published"))).limit(1);
  if (!rooms[0]) return null;
  const slots = await db.select().from(roomSlots).where(and(eq(roomSlots.roomId, roomId), eq(roomSlots.status, "open"))).orderBy(asc(roomSlots.startsAt));
  return { room: rooms[0], slots };
}

export async function createRoom(input: typeof creatorRooms.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [inserted] = await db.insert(creatorRooms).values(input).returning({ id: creatorRooms.id });
  return inserted.id;
}

export async function listCreatorRooms(creatorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(creatorRooms).where(eq(creatorRooms.creatorId, creatorId)).orderBy(asc(creatorRooms.createdAt));
}

export async function listCreatorBookings(creatorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bookings).where(eq(bookings.creatorId, creatorId)).orderBy(asc(bookings.createdAt));
}

export async function findOverlappingSlot(roomId: number, startsAt: Date, endsAt: Date, excludeSlotId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  const conditions = [
    eq(roomSlots.roomId, roomId),
    ne(roomSlots.status, "cancelled"),
    lt(roomSlots.startsAt, endsAt),
    gt(roomSlots.endsAt, startsAt),
  ];
  if (excludeSlotId) conditions.push(ne(roomSlots.id, excludeSlotId));
  const result = await db.select().from(roomSlots).where(and(...conditions)).limit(1);
  return result[0];
}

export async function createSlot(input: typeof roomSlots.$inferInsert) {
  if (input.endsAt <= input.startsAt) throw new Error("End time must be after the start time");
  const overlap = await findOverlappingSlot(input.roomId, input.startsAt, input.endsAt);
  if (overlap) throw new Error("This time overlaps with an existing slot for this room. Choose a different time.");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [inserted] = await db.insert(roomSlots).values(input).returning({ id: roomSlots.id });
  return inserted.id;
}

export async function reserveSlot(slotId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // node-postgres returns { rowCount } from an UPDATE, not MySQL's affectedRows.
  const result = await db.update(roomSlots).set({ status: "booked" }).where(and(eq(roomSlots.id, slotId), eq(roomSlots.status, "open")));
  return Number((result as any).rowCount ?? 0) === 1;
}

export async function releaseSlot(slotId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(roomSlots).set({ status: "open" }).where(and(eq(roomSlots.id, slotId), eq(roomSlots.status, "booked")));
}

export async function createBooking(input: typeof bookings.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [inserted] = await db.insert(bookings).values(input).returning({ id: bookings.id });
  return inserted.id;
}

export async function attachCheckoutToBooking(bookingId: number, sessionId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(bookings).set({ stripeCheckoutSessionId: sessionId, updatedAt: new Date() }).where(eq(bookings.id, bookingId));
}

export async function attachCoinbaseChargeToBooking(bookingId: number, chargeId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(bookings).set({ coinbaseChargeId: chargeId, updatedAt: new Date() }).where(eq(bookings.id, bookingId));
}

export async function markBookingPaidByCoinbaseCharge(chargeId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(bookings).set({ status: "paid", payoutStatus: "pending", updatedAt: new Date() }).where(eq(bookings.coinbaseChargeId, chargeId));
}

export async function recordCoinbaseEvent(eventId: string, eventType: string) {
  const db = await getDb();
  if (!db) return true;
  try {
    await db.insert(coinbaseEvents).values({ id: eventId, type: eventType });
    return true;
  } catch {
    return false;
  }
}

export async function recordStripeEvent(eventId: string, eventType: string) {
  const db = await getDb();
  if (!db) return true;
  try {
    await db.insert(stripeEvents).values({ id: eventId, type: eventType });
    return true;
  } catch {
    return false;
  }
}

export async function markBookingPaid(sessionId: string, paymentIntentId?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(bookings).set({ status: "paid", payoutStatus: "pending", stripePaymentIntentId: paymentIntentId ?? null, updatedAt: new Date() }).where(eq(bookings.stripeCheckoutSessionId, sessionId));
}

export async function getCreatorProfileByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
  return result[0];
}

/** Creates the row on first save, otherwise updates just the fields provided. */
export async function upsertCreatorProfile(userId: number, input: { displayName?: string; avatarDataUrl?: string; payoutWalletAddress?: string; payoutWalletAsset?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await getCreatorProfileByUserId(userId);
  if (!existing) {
    const [inserted] = await db.insert(creatorProfiles).values({ userId, ...input }).returning({ id: creatorProfiles.id });
    return inserted.id;
  }
  await db.update(creatorProfiles).set({ ...input, updatedAt: new Date() }).where(eq(creatorProfiles.userId, userId));
  return existing.id;
}

export async function setCreatorLive(userId: number, isLive: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await getCreatorProfileByUserId(userId);
  if (!existing) {
    // Someone can flip "I'm live" before ever saving a photo/name — create a
    // bare profile row rather than erroring.
    await db.insert(creatorProfiles).values({ userId, isLive });
    return;
  }
  await db.update(creatorProfiles).set({ isLive, updatedAt: new Date() }).where(eq(creatorProfiles.userId, userId));
}

/** Front-page roster: live creators first, then most recently updated. */
export async function listFrontCreators(limit = 8) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(creatorProfiles).orderBy(desc(creatorProfiles.isLive), desc(creatorProfiles.updatedAt)).limit(limit);
}
