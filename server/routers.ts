import Stripe from "stripe";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createSessionToken, hashPassword, isValidEmail, normalizeEmail, SESSION_COOKIE_MAX_AGE_MS, verifyPassword } from "./auth";
import { attachCheckoutToBooking, createBooking, createLocalUser, createRoom, createSlot, getRoomWithSlots, getUserByEmail, listCreatorBookings, listCreatorRooms, listPublishedRooms, releaseSlot, reserveSlot } from "./db";
import { createAccessToken, creatorRoomName, endRoom, ensureRoom, getRoomStatus, livekitWsUrl } from "./livekit";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

function setSessionCookie(ctx: { req: any; res: any }, token: string) {
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_COOKIE_MAX_AGE_MS });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // Real, standalone signup — no third party involved. See server/auth.ts
    // for why (this replaces a Manus-only OAuth flow this export never had
    // a working client half for).
    register: publicProcedure.input(z.object({ email: z.string().email(), password: z.string().min(8).max(200), name: z.string().min(1).max(160) })).mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      if (!isValidEmail(email)) throw new Error("Enter a valid email address");
      const existing = await getUserByEmail(email);
      if (existing) throw new Error("An account with that email already exists — try signing in instead.");
      const passwordHash = await hashPassword(input.password);
      const user = await createLocalUser({ email, name: input.name.trim(), passwordHash });
      if (!user) throw new Error("Could not create your account — please try again.");
      const token = await createSessionToken(user.id);
      setSessionCookie(ctx, token);
      return { user };
    }),
    login: publicProcedure.input(z.object({ email: z.string().email(), password: z.string().min(1).max(200) })).mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      const user = await getUserByEmail(email);
      const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
      if (!user || !valid) throw new Error("Incorrect email or password");
      const token = await createSessionToken(user.id);
      setSessionCookie(ctx, token);
      return { user };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  rooms: router({
    listPublished: publicProcedure.query(() => listPublishedRooms()),
    get: publicProcedure.input(z.object({ roomId: z.number().int().positive() })).query(({ input }) => getRoomWithSlots(input.roomId)),
    mine: protectedProcedure.query(({ ctx }) => listCreatorRooms(ctx.user.id)),
    create: protectedProcedure.input(z.object({ title: z.string().min(3).max(160), description: z.string().min(10), roomType: z.enum(["human", "avatar"]).default("human"), packageLabel: z.string().max(40).optional(), durationMinutes: z.number().int().min(5).max(180), capacity: z.number().int().min(1).max(50), priceCents: z.number().int().min(0).max(1000000), status: z.enum(["draft", "published"]).default("draft") })).mutation(({ input, ctx }) => createRoom({ ...input, creatorId: ctx.user.id })),
    addSlot: protectedProcedure.input(z.object({ roomId: z.number().int().positive(), startsAt: z.coerce.date(), endsAt: z.coerce.date() })).mutation(({ input }) => createSlot({ ...input, status: "open" })),
  }),
  bookings: router({
    ledger: protectedProcedure.query(({ ctx }) => listCreatorBookings(ctx.user.id)),
    createCheckout: publicProcedure.input(z.object({ roomId: z.number().int().positive(), slotId: z.number().int().positive(), guestName: z.string().min(2).max(160), guestEmail: z.string().email(), consentAccepted: z.literal(true), duoCreatorId: z.number().int().positive().optional(), duoSplitPercent: z.number().int().min(1).max(99).default(50) })).mutation(async ({ input, ctx }) => {
      const detail = await getRoomWithSlots(input.roomId);
      const slot = detail?.slots.find(candidate => candidate.id === input.slotId);
      if (!detail || !slot) throw new Error("That room or time slot is no longer available");
      const reserved = await reserveSlot(input.slotId);
      if (!reserved) throw new Error("That time slot was just booked. Please choose another slot.");
      const amountCents = detail.room.priceCents;
      const creatorShareCents = Math.floor(amountCents * 0.81);
      const bookingId = await createBooking({ roomId: input.roomId, slotId: input.slotId, guestName: input.guestName, guestEmail: input.guestEmail, duoCreatorId: input.duoCreatorId, duoSplitPercent: input.duoSplitPercent, consentAcceptedAt: new Date(), creatorId: detail.room.creatorId, amountCents, creatorShareCents, platformShareCents: amountCents - creatorShareCents, status: "pending", payoutStatus: "pending" });
      const origin = ctx.req.headers.origin || "https://lensflow.com.au";
      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.create({ mode: "payment", customer_email: input.guestEmail, client_reference_id: String(bookingId), metadata: { booking_id: String(bookingId), room_id: String(input.roomId), slot_id: String(input.slotId) }, line_items: [{ price_data: { currency: detail.room.currency.toLowerCase(), product_data: { name: detail.room.title, description: detail.room.description }, unit_amount: amountCents }, quantity: 1 }], success_url: `${origin}/?booking=success&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/?booking=cancelled` });
      } catch (error) {
        await releaseSlot(input.slotId);
        throw error;
      }
      await attachCheckoutToBooking(bookingId, session.id);
      return { bookingId, checkoutUrl: session.url };
    }),
  }),
  live: router({
    // Creator starts broadcasting: ensures their LiveKit Room exists and
    // returns a scoped, publish-enabled Access Token the browser uses.
    goLive: protectedProcedure.mutation(async ({ ctx }) => {
      const roomName = creatorRoomName(ctx.user.id);
      await ensureRoom(roomName);
      const identity = `creator-${ctx.user.id}`;
      const token = await createAccessToken({ identity, roomName, canPublish: true, name: ctx.user.name ?? undefined });
      return { roomName, token, identity, wsUrl: livekitWsUrl() };
    }),
    // Creator ends the broadcast: disconnects everyone and deletes the room.
    endLive: protectedProcedure.mutation(async ({ ctx }) => {
      const roomName = creatorRoomName(ctx.user.id);
      await endRoom(roomName);
      return { success: true } as const;
    }),
    // Anyone can check whether a given room is currently live (used by the
    // watch page to show "offline" vs. a join button).
    status: publicProcedure.input(z.object({ roomName: z.string().min(1) })).query(({ input }) => getRoomStatus(input.roomName)),
    // Fan requests a genuinely subscribe-only token (canPublish: false is
    // enforced server-side by LiveKit, not just an app-level convention).
    viewerToken: publicProcedure.input(z.object({ roomName: z.string().min(1).max(120), guestName: z.string().max(60).optional() })).mutation(async ({ input }) => {
      const safeName = (input.guestName ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30) || "fan";
      const identity = `viewer-${safeName}-${Math.random().toString(36).slice(2, 8)}`;
      const token = await createAccessToken({ identity, roomName: input.roomName, canPublish: false, name: input.guestName });
      return { token, identity, wsUrl: livekitWsUrl() };
    }),
  }),
});

export type AppRouter = typeof appRouter;
