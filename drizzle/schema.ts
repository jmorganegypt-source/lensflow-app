import { integer, pgEnum, pgTable, primaryKey, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

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
  payoutStatus: payoutStatusEnum("payoutStatus").notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const stripeEvents = pgTable("stripe_events", {
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
