import { sql } from "drizzle-orm";
import { boolean, integer, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, uniqueIndex, varchar } from "drizzle-orm/pg-core";

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

// ---------------------------------------------------------------------------
// Companions: always-on AI chat/voice/video characters, distinct from the
// creatorRooms "avatar" room type above (which is a booked time slot, same
// as a human room). A companion has no schedule — a user picks one and can
// chat with it any time.
//
// Two ways a companion can come to exist (see companionSourceEnum) and this
// is a hard product rule, not just a default: "curated" companions are
// original characters this platform supplies (art + voice + personality),
// and "self_avatar" companions are built ONLY from a user's own
// liveness-verified selfie (selfAvatarVerifications below) — never from an
// arbitrary uploaded photo of someone else. ownerId is null for curated
// companions and set to the verified owner for a self-avatar; isPublic is
// hard-false for self-avatar companions at the database default so a bug
// elsewhere can't accidentally list one on another user's companion picker.
export const companionSourceEnum = pgEnum("companion_source", ["curated", "self_avatar"]);

export const companions = pgTable("companions", {
  id: serial("id").primaryKey(),
  creatorId: integer("creatorId"), // set if a LensFlow creator authored this curated companion
  ownerId: integer("ownerId"), // set only for a self_avatar companion — that user, and only that user
  source: companionSourceEnum("source").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  tagline: varchar("tagline", { length: 160 }),
  // Seeds the system prompt for every conversation with this companion —
  // see server/companions.ts buildSystemPrompt.
  personality: text("personality").notNull(),
  avatarImageUrl: text("avatarImageUrl"), // null until real art / a verified selfie is attached
  elevenlabsVoiceId: varchar("elevenlabsVoiceId", { length: 64 }), // ElevenLabs voice for the text-chat "Play voice" button
  anamPersonaId: varchar("anamPersonaId", { length: 128 }), // reserved — an Anam persona created via their API; currently we pass avatar+voice inline instead
  // Anam video: a stock avatar + voice id from Anam's library (see
  // server/anam.ts). When both are set, the "Start video" button appears
  // and a session is minted with llmId "Disable LLM" so our existing
  // Claude+memory chat stays the brain and Anam only renders the reply.
  anamAvatarId: varchar("anamAvatarId", { length: 64 }),
  anamVoiceId: varchar("anamVoiceId", { length: 64 }),
  isPublic: boolean("isPublic").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => ({
  // Scoped to curated rows only — every self_avatar companion is named
  // "You" (server/db.ts createSelfAvatarCompanion), so a plain global
  // unique(name) would break the second person who ever makes one.
  // This is also what makes seedCuratedCompanions() safe to run
  // concurrently on every boot (server/_core/index.ts) via ON CONFLICT
  // DO NOTHING instead of a racy check-then-insert.
  curatedNameUnique: uniqueIndex("companions_curated_name_unique").on(table.name).where(sql`${table.source} = 'curated'`),
}));

// One conversation per (user, companion) pair — this is where "it actually
// remembers you" lives. memorySummary is a running summary folded in every
// few turns (see server/companions.ts summarizeIfNeeded) so the prompt sent
// to the model each turn stays small regardless of how long the
// relationship gets, instead of replaying the full transcript forever.
export const companionConversations = pgTable("companion_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  companionId: integer("companionId").notNull(),
  memorySummary: text("memorySummary"),
  messageCountSinceSummary: integer("messageCountSinceSummary").notNull().default(0),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ oneConversationPerPair: unique().on(table.userId, table.companionId) }));

export const companionMessages = pgTable("companion_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  role: varchar("role", { length: 16 }).notNull(), // "user" | "companion"
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// The only source of truth for "this photo is safe to build a self-avatar
// companion from": one row per user, written once their selfie passes a
// liveness check (ties the photo to the account holder, not a photo of
// someone else) — see server/selfAvatar.ts (added when that flow is built).
export const selfAvatarVerifications = pgTable("self_avatar_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  verifiedImageUrl: text("verifiedImageUrl").notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  verifiedAt: timestamp("verifiedAt").defaultNow().notNull(),
});

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
export type Companion = typeof companions.$inferSelect;
export type InsertCompanion = typeof companions.$inferInsert;
export type CompanionConversation = typeof companionConversations.$inferSelect;
export type CompanionMessage = typeof companionMessages.$inferSelect;
export type SelfAvatarVerification = typeof selfAvatarVerifications.$inferSelect;
