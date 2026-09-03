import { int, mysqlEnum, mysqlTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
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
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const creatorRooms = mysqlTable("creator_rooms", {
  id: int("id").autoincrement().primaryKey(),
  creatorId: int("creatorId").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description").notNull(),
  roomType: mysqlEnum("roomType", ["human", "avatar"]).notNull().default("human"),
  packageLabel: varchar("packageLabel", { length: 40 }),
  durationMinutes: int("durationMinutes").notNull().default(30),
  capacity: int("capacity").notNull().default(1),
  priceCents: int("priceCents").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  status: mysqlEnum("status", ["draft", "published", "archived"]).notNull().default("draft"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const roomSlots = mysqlTable("room_slots", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  status: mysqlEnum("status", ["open", "booked", "cancelled"]).notNull().default("open"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  slotId: int("slotId").notNull(),
  creatorId: int("creatorId").notNull(),
  duoCreatorId: int("duoCreatorId"),
  duoSplitPercent: int("duoSplitPercent").notNull().default(50),
  guestName: varchar("guestName", { length: 160 }),
  guestEmail: varchar("guestEmail", { length: 320 }).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "cancelled", "refunded"]).notNull().default("pending"),
  consentAcceptedAt: timestamp("consentAcceptedAt"),
  amountCents: int("amountCents").notNull().default(0),
  creatorShareCents: int("creatorShareCents").notNull().default(0),
  platformShareCents: int("platformShareCents").notNull().default(0),
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 255 }).unique(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  payoutStatus: mysqlEnum("payoutStatus", ["pending", "processing", "paid", "not_applicable"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const stripeEvents = mysqlTable("stripe_events", {
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
