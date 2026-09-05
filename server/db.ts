import { and, asc, count, desc, eq, gte, lt, gt, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { bookings, coinbaseEvents, companionConversations, companionMessages, companions, companionSubscriptions, creatorProfiles, creatorRooms, InsertUser, promoCreditGrants, roomSlots, selfAvatarVerifications, stripeEvents, users } from "../drizzle/schema";
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
        // Fail a stuck connection fast instead of hanging the whole boot
        // (see server/_core/index.ts — migrations run after the port is
        // already bound, but a hung pool would still stall the app).
        connectionTimeoutMillis: 10_000,
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

/** Promote the OWNER_EMAIL account to admin if it isn't already — covers the
 *  case where that account registered before OWNER_EMAIL was set (role is
 *  fixed at registration). Call on login. */
export async function syncOwnerRole<T extends { id: number; email: string | null; role: "user" | "admin" }>(user: T): Promise<T> {
  if (!ENV.ownerEmail || !user.email) return user;
  if (user.email.toLowerCase() !== ENV.ownerEmail || user.role === "admin") return user;
  const db = await getDb();
  if (!db) return user;
  await db.update(users).set({ role: "admin", updatedAt: new Date() }).where(eq(users.id, user.id));
  return { ...user, role: "admin" as const };
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

// ---------------------------------------------------------------------------
// Companions

/** The public companion picker — curated characters only, never a self_avatar (those are private to their owner). */
export async function listCuratedCompanions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companions).where(and(eq(companions.source, "curated"), eq(companions.isPublic, true))).orderBy(asc(companions.id));
}

export async function getCompanion(companionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companions).where(eq(companions.id, companionId)).limit(1);
  return result[0];
}

/** True for anyone, logged in or not — the public picker's visibility rule. A self_avatar companion is never publicly visible. */
export function isPubliclyVisibleCompanion(companion: typeof companions.$inferSelect) {
  return companion.source === "curated" && companion.isPublic;
}

/** True if this specific user is allowed to open/chat with this companion: publicly visible, or one they own. */
export function canAccessCompanion(companion: typeof companions.$inferSelect, userId: number) {
  if (isPubliclyVisibleCompanion(companion)) return true;
  return (companion.source === "self_avatar" || companion.source === "generated") && companion.ownerId === userId;
}

export async function getOrCreateConversation(userId: number, companionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(companionConversations).where(and(eq(companionConversations.userId, userId), eq(companionConversations.companionId, companionId))).limit(1);
  if (existing[0]) return existing[0];
  const [inserted] = await db.insert(companionConversations).values({ userId, companionId }).returning();
  return inserted;
}

/** Most recent 8 conversations for a user, newest first — the "continue chatting" list. */
export async function listMyConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companionConversations).where(eq(companionConversations.userId, userId)).orderBy(desc(companionConversations.lastMessageAt)).limit(8);
}

/** Oldest-first, capped — the recent raw turns that ride alongside memorySummary in the prompt. See server/companions.ts. */
export async function listRecentMessages(conversationId: number, limit = 12) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(companionMessages).where(eq(companionMessages.conversationId, conversationId)).orderBy(desc(companionMessages.createdAt)).limit(limit);
  return rows.reverse();
}

export async function appendCompanionMessage(conversationId: number, role: "user" | "companion", content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(companionMessages).values({ conversationId, role, content });
  await db.update(companionConversations).set({ lastMessageAt: new Date(), messageCountSinceSummary: sql`${companionConversations.messageCountSinceSummary} + 1` }).where(eq(companionConversations.id, conversationId));
}

export async function updateMemorySummary(conversationId: number, summary: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(companionConversations).set({ memorySummary: summary, messageCountSinceSummary: 0 }).where(eq(companionConversations.id, conversationId));
}

// ---------------------------------------------------------------------------
// Companion subscriptions (the /companions weekly paywall)

const COMPANION_ACCESS_STATUSES = ["active", "trialing"] as const;

export async function getCompanionSubscription(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companionSubscriptions).where(eq(companionSubscriptions.userId, userId)).limit(1);
  return result[0];
}

/** Access is status-based — currentPeriodEnd is only for display. Admins
 *  (OWNER_EMAIL) are comped, and so is anyone inside an unexpired promo
 *  window (admin-granted credits, see grantPromoCredits). */
export async function hasActiveCompanionAccess(userId: number) {
  const user = await getUserById(userId);
  if (user?.role === "admin") return true;
  if (user?.companionAccessUntil && user.companionAccessUntil.getTime() > Date.now()) return true;
  const sub = await getCompanionSubscription(userId);
  return !!sub && (COMPANION_ACCESS_STATUSES as readonly string[]).includes(sub.status);
}

/** Row is created on first checkout and keyed by userId thereafter. */
export async function upsertCompanionSubscription(userId: number, input: { stripeCustomerId?: string; stripeSubscriptionId?: string; status?: (typeof companionSubscriptions.$inferInsert)["status"]; currentPeriodEnd?: Date | null }) {
  const db = await getDb();
  if (!db) return;
  const existing = await getCompanionSubscription(userId);
  if (!existing) {
    await db.insert(companionSubscriptions).values({ userId, ...input });
    return;
  }
  await db.update(companionSubscriptions).set({ ...input, updatedAt: new Date() }).where(eq(companionSubscriptions.userId, userId));
}

/** Webhook path — keyed on the Stripe subscription id (userId not always in scope for subscription.* events). */
export async function updateCompanionSubscriptionByStripeId(stripeSubscriptionId: string, input: { status: (typeof companionSubscriptions.$inferInsert)["status"]; currentPeriodEnd?: Date | null }) {
  const db = await getDb();
  if (!db) return;
  await db.update(companionSubscriptions).set({ ...input, updatedAt: new Date() }).where(eq(companionSubscriptions.stripeSubscriptionId, stripeSubscriptionId));
}

export async function createSelfAvatarVerification(userId: number, verifiedImageUrl: string, provider: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(selfAvatarVerifications).values({ userId, verifiedImageUrl, provider }).onConflictDoUpdate({ target: selfAvatarVerifications.userId, set: { verifiedImageUrl, provider, verifiedAt: new Date() } });
}

export async function getSelfAvatarVerification(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(selfAvatarVerifications).where(eq(selfAvatarVerifications.userId, userId)).limit(1);
  return result[0];
}

/** A user has at most one self_avatar companion — this is it, if they've made one. */
export async function getSelfAvatarCompanion(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companions).where(and(eq(companions.source, "self_avatar"), eq(companions.ownerId, userId))).limit(1);
  return result[0];
}

export async function createSelfAvatarCompanion(userId: number, imageUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [inserted] = await db.insert(companions).values({
    source: "self_avatar",
    ownerId: userId,
    name: "You",
    personality: "This companion is the user's own verified self-avatar. Respond as a supportive, attentive presence shaped by the ongoing conversation, not a pre-written character with its own backstory.",
    avatarImageUrl: imageUrl,
    isPublic: false,
  }).returning({ id: companions.id });
  return inserted.id;
}

const MAX_DESIGNED_PER_USER = 5;

/** A user's own designed ("generated") companions, newest first. */
export async function listDesignedCompanions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companions).where(and(eq(companions.source, "generated"), eq(companions.ownerId, userId))).orderBy(desc(companions.createdAt));
}

export async function createDesignedCompanion(userId: number, input: { name: string; tagline: string; personality: string; avatarImageUrl: string; elevenlabsVoiceId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const mine = await listDesignedCompanions(userId);
  if (mine.length >= MAX_DESIGNED_PER_USER) throw new Error(`You can have up to ${MAX_DESIGNED_PER_USER} designed companions. Delete one first.`);
  const [inserted] = await db.insert(companions).values({
    source: "generated",
    ownerId: userId,
    isPublic: false,
    name: input.name,
    tagline: input.tagline,
    personality: input.personality,
    avatarImageUrl: input.avatarImageUrl,
    elevenlabsVoiceId: input.elevenlabsVoiceId,
  }).returning({ id: companions.id });
  return inserted.id;
}

export async function deleteDesignedCompanion(userId: number, companionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(companions).where(and(eq(companions.id, companionId), eq(companions.ownerId, userId), eq(companions.source, "generated")));
}

// ---------------------------------------------------------------------------
// Admin dashboard (server/routers.ts `admin` router, adminProcedure only)

/** The fixed promotional-credit pool an admin can hand out. 1 credit =
 *  1 day of full Companions access. Not stored in the DB — the amount
 *  already spent is SUM(promo_credit_grants.credits), and this is the cap
 *  that sum can't exceed. */
export const PROMO_CREDIT_POOL = 5000;

async function scalar(promise: Promise<{ v: unknown }[]>): Promise<number> {
  const rows = await promise;
  return Number(rows[0]?.v ?? 0);
}

/** Every headline number the admin page shows. */
export async function getAdminOverview() {
  const db = await getDb();
  if (!db) {
    return null;
  }

  const [
    totalUsers,
    adminUsers,
    newUsers7d,
    creatorProfileCount,
    liveCreators,
    publishedRoomCount,
    paidBookingCount,
    bookingGrossCents,
    platformCutCents,
    pendingPayoutCents,
    curatedCompanions,
    designedCompanions,
    conversationCount,
    companionMessageCount,
    promoSpent,
    promoRecipients,
    compActiveViaCredits,
  ] = await Promise.all([
    scalar(db.select({ v: count() }).from(users)),
    scalar(db.select({ v: count() }).from(users).where(eq(users.role, "admin"))),
    scalar(db.select({ v: count() }).from(users).where(gte(users.createdAt, sql`now() - interval '7 days'`))),
    scalar(db.select({ v: count() }).from(creatorProfiles)),
    scalar(db.select({ v: count() }).from(creatorProfiles).where(eq(creatorProfiles.isLive, true))),
    scalar(db.select({ v: count() }).from(creatorRooms).where(eq(creatorRooms.status, "published"))),
    scalar(db.select({ v: count() }).from(bookings).where(eq(bookings.status, "paid"))),
    scalar(db.select({ v: sql`coalesce(sum(${bookings.amountCents}), 0)` }).from(bookings).where(eq(bookings.status, "paid"))),
    scalar(db.select({ v: sql`coalesce(sum(${bookings.platformShareCents}), 0)` }).from(bookings).where(eq(bookings.status, "paid"))),
    scalar(db.select({ v: sql`coalesce(sum(${bookings.creatorShareCents}), 0)` }).from(bookings).where(and(eq(bookings.status, "paid"), eq(bookings.payoutStatus, "pending")))),
    scalar(db.select({ v: count() }).from(companions).where(eq(companions.source, "curated"))),
    scalar(db.select({ v: count() }).from(companions).where(eq(companions.source, "generated"))),
    scalar(db.select({ v: count() }).from(companionConversations)),
    scalar(db.select({ v: count() }).from(companionMessages)),
    scalar(db.select({ v: sql`coalesce(sum(${promoCreditGrants.credits}), 0)` }).from(promoCreditGrants)),
    scalar(db.select({ v: sql`count(distinct ${promoCreditGrants.userId})` }).from(promoCreditGrants)),
    scalar(db.select({ v: count() }).from(users).where(gt(users.companionAccessUntil, sql`now()`))),
  ]);

  // Companion subscriptions broken out by Stripe status ("what packages paid").
  const subRows = await db.select({ status: companionSubscriptions.status, n: count() }).from(companionSubscriptions).groupBy(companionSubscriptions.status);
  const subsByStatus: Record<string, number> = {};
  for (const row of subRows) subsByStatus[row.status] = Number(row.n);
  const payingSubs = (subsByStatus["active"] ?? 0) + (subsByStatus["trialing"] ?? 0);

  return {
    users: { total: totalUsers, admins: adminUsers, new7d: newUsers7d },
    creators: { profiles: creatorProfileCount, live: liveCreators, publishedRooms: publishedRoomCount },
    bookings: {
      paid: paidBookingCount,
      grossCents: bookingGrossCents,
      platformCutCents,
      creatorPayoutsOwedCents: pendingPayoutCents,
    },
    companionSubscriptions: {
      byStatus: subsByStatus,
      paying: payingSubs,
      priceCents: ENV.companionPriceCents,
      currency: ENV.companionPriceCurrency,
      weeklyRecurringCents: payingSubs * ENV.companionPriceCents,
      annualRunRateCents: payingSubs * ENV.companionPriceCents * 52,
    },
    companions: { curated: curatedCompanions, designed: designedCompanions, conversations: conversationCount, messages: companionMessageCount },
    promo: {
      pool: PROMO_CREDIT_POOL,
      spent: promoSpent,
      remaining: Math.max(0, PROMO_CREDIT_POOL - promoSpent),
      recipients: promoRecipients,
      activeNow: compActiveViaCredits,
    },
  };
}

/** Most recent signups for the admin users table. */
export async function listRecentUsers(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      promoCredits: users.promoCredits,
      companionAccessUntil: users.companionAccessUntil,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(Math.min(limit, 200));
  return rows;
}

/** Recent promo-credit grants, newest first, with the recipient's email joined in. */
export async function listPromoGrants(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: promoCreditGrants.id,
      credits: promoCreditGrants.credits,
      note: promoCreditGrants.note,
      createdAt: promoCreditGrants.createdAt,
      userId: promoCreditGrants.userId,
      email: users.email,
      name: users.name,
    })
    .from(promoCreditGrants)
    .leftJoin(users, eq(users.id, promoCreditGrants.userId))
    .orderBy(desc(promoCreditGrants.createdAt))
    .limit(Math.min(limit, 200));
}

/** Give a user N promo credits (= N days of Companions access). Draws the
 *  pool down atomically: the SUM check and the three writes run in one
 *  transaction so two admins can't oversell the 5000-credit pool. */
export async function grantPromoCredits(input: { email: string; credits: number; note?: string; grantedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.trim().toLowerCase();
  const credits = Math.floor(input.credits);
  if (!Number.isFinite(credits) || credits <= 0) throw new Error("Enter a positive number of credits");

  return db.transaction(async tx => {
    const target = (await tx.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (!target) throw new Error(`No account found for ${email}`);

    const spentRows = await tx.select({ v: sql`coalesce(sum(${promoCreditGrants.credits}), 0)` }).from(promoCreditGrants);
    const spent = Number(spentRows[0]?.v ?? 0);
    const remaining = PROMO_CREDIT_POOL - spent;
    if (credits > remaining) throw new Error(`Only ${remaining} credits left in the pool`);

    await tx.insert(promoCreditGrants).values({ userId: target.id, credits, note: input.note?.trim() || null, grantedBy: input.grantedBy });

    // Extend from whichever is later — a still-valid existing window, or now.
    const base = target.companionAccessUntil && target.companionAccessUntil.getTime() > Date.now() ? target.companionAccessUntil : new Date();
    const newUntil = new Date(base.getTime() + credits * 24 * 60 * 60 * 1000);
    await tx
      .update(users)
      .set({ promoCredits: sql`${users.promoCredits} + ${credits}`, companionAccessUntil: newUntil, updatedAt: new Date() })
      .where(eq(users.id, target.id));

    return { email, credits, accessUntil: newUntil, poolRemaining: remaining - credits };
  });
}

/** All curated companions (public roster + any admin-created ones toggled off), for the admin manager. */
export async function adminListCuratedCompanions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companions).where(eq(companions.source, "curated")).orderBy(asc(companions.id));
}

export async function adminCreateCuratedCompanion(input: {
  name: string;
  tagline?: string;
  personality: string;
  avatarImageUrl: string;
  elevenlabsVoiceId?: string;
  anamAvatarId?: string;
  anamVoiceId?: string;
  isPublic: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = (await db.select({ id: companions.id }).from(companions).where(and(eq(companions.source, "curated"), eq(companions.name, input.name))).limit(1))[0];
  if (existing) throw new Error(`A curated companion named "${input.name}" already exists`);
  const [inserted] = await db
    .insert(companions)
    .values({
      source: "curated",
      name: input.name,
      tagline: input.tagline ?? null,
      personality: input.personality,
      avatarImageUrl: input.avatarImageUrl,
      elevenlabsVoiceId: input.elevenlabsVoiceId ?? null,
      anamAvatarId: input.anamAvatarId ?? null,
      anamVoiceId: input.anamVoiceId ?? null,
      isPublic: input.isPublic,
    })
    .returning({ id: companions.id });
  return inserted.id;
}

export async function adminSetCompanionPublic(companionId: number, isPublic: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(companions).set({ isPublic, updatedAt: new Date() }).where(and(eq(companions.id, companionId), eq(companions.source, "curated")));
}

export async function adminDeleteCuratedCompanion(companionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(companions).where(and(eq(companions.id, companionId), eq(companions.source, "curated")));
}
