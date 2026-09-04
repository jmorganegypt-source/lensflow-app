import { boolean, integer, pgEnum, pgTable, primaryKey, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const roomTypeEnum = pgEnum("room_type", ["human", "avatar"]);
export const roomStatusEnum = pgEnum("room_status", ["draft", "published", "archived"]);
export const slotStatusEnum = pgEnum("slot_status", ["open", "booked", "cancelled"]);
export const bookingStatusEnum = pgEnum("booking_status", ["pending", "paid", "cancelled", "refunded"]);
export const payoutStatusEnum = pgEnum("payout_status", ["pending", "processing", "paid", "not_applicable"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  // Historically a Manus-issued identity string; for locally-registered
  // accounts this is just a generated unique id (see server/db.ts
  // createLocalUser) — it's kept only because everything else keys off the
  // numeric `id`, not this column.
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // Salted scrypt hash ("salt:hash" hex), see server/auth.ts. Null only for
  // legacy rows created before local email/password auth existed.
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Postgres has no MySQL-style ON UPDATE clause — server/db.ts sets this
  // explicitly on every UPDATE that should bump it.
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const creatorRooms = pgTable("creator_rooms", {
  id: serial("id").primaryKey(),
  creatorId: integer("creatorId").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description").notNull(),
  roomType: roomTypeEnum("roomType").notNull().default("human"),
  packageLabel: varchar("packageLabel", { length: 40 }),
  durationMinutes: integer("durationMinutes").notNull().default(30),
  capacity: integer("capacity").notNull().default(1),
  priceCents: integer("priceCents").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  status: roomStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const roomSlots = pgTable("room_slots", {
  id: serial("id").primaryKey(),
  roomId: integer("roomId").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  status: slotStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  roomId: integer("roomId").notNull(),
  slotId: integer("slotId").notNull(),
  creatorId: integer("creatorId").notNull(),
  duoCreatorId: integer("duoCreatorId"),
  duoSplitPercent: integer("duoSplitPercent").notNull().default(50),
  guestName: varchar("guestName", { length: 160 }),
  guestEmail: varchar("guestEmail", { length: 320 }).notNull(),
  status: bookingStatusEnum("status").notNull().default("pending"),
  consentAcceptedAt: timestamp("consentAcceptedAt"),
  amountCents: integer("amountCents").notNull().default(0),
  creatorShareCents: integer("creatorShareCents").notNull().default(0),
  platformShareCents: integer("platformShareCents").notNull().default(0),
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 255 }).unique(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  // Set instead of the two Stripe columns above when a guest pays with
  // crypto via Coinbase Commerce (see server/coinbase.ts / routers.ts
  // bookings.createCryptoCheckout). A booking has at most one of the two
  // payment paths, never both.
  coinbaseChargeId: varchar("coinbaseChargeId", { length: 255 }).unique(),
  payoutStatus: payoutStatusEnum("payoutStatus").notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// One row per creator, separate from creatorRooms because a creator has a
// single front-page presence (photo, display name, live/off) independent of
// how many bookable rooms they've published — including zero, for someone
// who's just signed up and hasn't created a room yet.
export const creatorProfiles = pgTable("creator_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  displayName: varchar("displayName", { length: 160 }),
  // Data-URL (base64) image, stored directly in Postgres. This is an MVP
  // choice, not a permanent architecture — there's no working object storage
  // in this deployment yet (server/storage.ts only talks to a Manus-only
  // "Forge" backend that isn't configured on Render, see storageProxy.ts).
  // Move this to real S3/Cloudinary-backed storage once that's set up;
  // client-side upload already resizes/compresses before sending, to keep
  // rows small in the meantime.
  avatarDataUrl: text("avatarDataUrl"),
  isLive: boolean("isLive").notNull().default(false),
  // Where this creator wants their crypto payouts sent. Self-reported by the
  // creator, stored as-is — the platform doesn't validate, custody, or move
  // any funds here; it's a destination address for whatever payout process
  // runs outside this app (this only stores it, it doesn't wire one up).
  payoutWalletAddress: varchar("payoutWalletAddress", { length: 128 }),
  payoutWalletAsset: varchar("payoutWalletAsset", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const stripeEvents = pgTable("stripe_events", {
  id: varchar("id", { length: 255 }).notNull(),
  type: varchar("type", { length: 160 }).notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, table => ({ pk: primaryKey({ columns: [table.id] }) }));

// Same dedupe/audit role as stripeEvents above, kept separate because these
// are two independent webhook sources with their own event-id namespaces.
export const coinbaseEvents = pgTable("coinbase_events", {
  id: varchar("id", { length: 255 }).notNull(),
  type: varchar("type", { length: 160 }).notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, table => ({ pk: primaryKey({ columns: [table.id] }) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CreatorRoom = typeof creatorRooms.$inferSelect;
export type InsertCreatorRoom = typeof creatorRooms.$inferInsert;
export type RoomSlot = typeof roomSlots.$inferSelect;
export type InsertRoomSlot = typeof roomSlots.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;
export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type InsertCreatorProfile = typeof creatorProfiles.$inferInsert;
