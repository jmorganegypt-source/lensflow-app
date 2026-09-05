import Stripe from "stripe";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createSessionToken, hashPassword, isValidEmail, normalizeEmail, SESSION_COOKIE_MAX_AGE_MS, toPublicUser, verifyPassword } from "./auth";
import { attachCheckoutToBooking, attachCoinbaseChargeToBooking, canAccessCompanion, createBooking, createLocalUser, createRoom, createSelfAvatarCompanion, createSelfAvatarVerification, createSlot, getCompanion, getCreatorProfileByUserId, getOrCreateConversation, getRoomWithSlots, getSelfAvatarCompanion, getUserByEmail, isPubliclyVisibleCompanion, listCreatorBookings, listCreatorRooms, listCuratedCompanions, listFrontCreators, listMyConversations, listPublishedRooms, listRecentMessages, releaseSlot, reserveSlot, setCreatorLive, upsertCreatorProfile } from "./db";
import { createAccessToken, creatorRoomName, endRoom, ensureRoom, getRoomStatus, livekitWsUrl } from "./livekit";
import { createCoinbaseCharge } from "./coinbase";
import { sendCompanionMessage } from "./companions";
import { synthesizeSpeech } from "./elevenlabs";
import { verifyLiveness } from "./selfAvatar";
import { createAnamSessionToken } from "./anam";
import { createCompanionBillingPortal, createCompanionCheckout, getCompanionAccessSummary, hasActiveCompanionAccess } from "./companionBilling";
import { generateCompanionPortrait } from "./imageGen";
import { createDesignedCompanion, deleteDesignedCompanion, listDesignedCompanions } from "./db";

const PAYOUT_WALLET_ASSETS = ["USDT-TRC20", "USDT-ERC20", "USDC-ERC20", "USDC-SOL"] as const;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

function setSessionCookie(ctx: { req: any; res: any }, token: string) {
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_COOKIE_MAX_AGE_MS });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => (opts.ctx.user ? toPublicUser(opts.ctx.user) : null)),
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
      return { user: toPublicUser(user) };
    }),
    login: publicProcedure.input(z.object({ email: z.string().email(), password: z.string().min(1).max(200) })).mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      const user = await getUserByEmail(email);
      const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
      if (!user || !valid) throw new Error("Incorrect email or password");
      const token = await createSessionToken(user.id);
      setSessionCookie(ctx, token);
      return { user: toPublicUser(user) };
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
    // Same booking/slot logic as createCheckout above, but hands the guest a
    // Coinbase Commerce hosted charge instead of a Stripe session — pay with
    // BTC, ETH, USDC, or whatever else the merchant's Commerce account has
    // enabled. The booking is only marked paid once the Coinbase webhook
    // confirms it (server/coinbaseWebhook.ts) — this mutation just opens the
    // tab, it never marks anything paid itself.
    createCryptoCheckout: publicProcedure.input(z.object({ roomId: z.number().int().positive(), slotId: z.number().int().positive(), guestName: z.string().min(2).max(160), guestEmail: z.string().email(), consentAccepted: z.literal(true), duoCreatorId: z.number().int().positive().optional(), duoSplitPercent: z.number().int().min(1).max(99).default(50) })).mutation(async ({ input, ctx }) => {
      const detail = await getRoomWithSlots(input.roomId);
      const slot = detail?.slots.find(candidate => candidate.id === input.slotId);
      if (!detail || !slot) throw new Error("That room or time slot is no longer available");
      const reserved = await reserveSlot(input.slotId);
      if (!reserved) throw new Error("That time slot was just booked. Please choose another slot.");
      const amountCents = detail.room.priceCents;
      const creatorShareCents = Math.floor(amountCents * 0.81);
      const bookingId = await createBooking({ roomId: input.roomId, slotId: input.slotId, guestName: input.guestName, guestEmail: input.guestEmail, duoCreatorId: input.duoCreatorId, duoSplitPercent: input.duoSplitPercent, consentAcceptedAt: new Date(), creatorId: detail.room.creatorId, amountCents, creatorShareCents, platformShareCents: amountCents - creatorShareCents, status: "pending", payoutStatus: "pending" });
      const origin = ctx.req.headers.origin || "https://lensflow.com.au";
      let charge: { id: string; hostedUrl: string };
      try {
        charge = await createCoinbaseCharge({
          name: detail.room.title,
          description: detail.room.description,
          amountCents,
          currency: detail.room.currency,
          metadata: { booking_id: String(bookingId), room_id: String(input.roomId), slot_id: String(input.slotId) },
          redirectUrl: `${origin}/?booking=success&session_id=${bookingId}`,
          cancelUrl: `${origin}/?booking=cancelled`,
        });
      } catch (error) {
        await releaseSlot(input.slotId);
        throw error;
      }
      await attachCoinbaseChargeToBooking(bookingId, charge.id);
      return { bookingId, checkoutUrl: charge.hostedUrl };
    }),
  }),
  // The front-page creator roster (the 8-box grid) and the profile a
  // creator edits from their dashboard: display name, photo, and a manual
  // "I'm live" / "I'm off" flag. This is independent of the real LiveKit
  // broadcast state in the `live` router below — it's a simple sign a
  // creator flips themselves, not a check that they're actually streaming.
  creators: router({
    listFront: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(24).default(8) }).optional()).query(({ input }) => listFrontCreators(input?.limit ?? 8)),
    myProfile: protectedProcedure.query(({ ctx }) => getCreatorProfileByUserId(ctx.user.id)),
    upsertProfile: protectedProcedure.input(z.object({
      displayName: z.string().min(1).max(160).optional(),
      // Data URL, e.g. "data:image/jpeg;base64,...". Client resizes/compresses
      // before sending; this cap (~3MB of base64 text) is a hard backstop.
      avatarDataUrl: z.string().max(3_000_000).startsWith("data:image/").optional(),
      // Where this creator's crypto payouts get sent. Self-reported, stored
      // as-is — see drizzle/schema.ts creatorProfiles for what this does
      // and doesn't mean (no custody, no automated payout run here yet).
      payoutWalletAddress: z.string().min(6).max(128).optional(),
      payoutWalletAsset: z.enum(PAYOUT_WALLET_ASSETS).optional(),
    })).mutation(({ input, ctx }) => upsertCreatorProfile(ctx.user.id, input)),
    setLive: protectedProcedure.input(z.object({ isLive: z.boolean() })).mutation(({ input, ctx }) => setCreatorLive(ctx.user.id, input.isLive)),
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
    // Lets a second creator join the host's LiveKit room as an additional
    // publisher, for duo/co-host shows (see client/src/pages/Studio.tsx —
    // "Duo" split-screen mode). MVP trust model: the host shares their
    // numeric creator code (their user id) only with whoever they intend to
    // co-host with — there's no accept/reject step yet. Tighten this with a
    // real invite/approval flow before it matters that anyone who learns a
    // host's id could technically publish into their room.
    coHostToken: protectedProcedure.input(z.object({ hostUserId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const roomName = creatorRoomName(input.hostUserId);
      await ensureRoom(roomName);
      const identity = `cohost-${ctx.user.id}-${Math.random().toString(36).slice(2, 8)}`;
      const token = await createAccessToken({ identity, roomName, canPublish: true, name: ctx.user.name ?? undefined });
      return { roomName, token, identity, wsUrl: livekitWsUrl() };
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
  // Always-on AI companions — distinct from the "avatar" room type above,
  // which is a booked time slot. A companion has no schedule: pick one,
  // chat any time, and it remembers you next time (server/companions.ts).
  // Every route here only ever touches "curated" companions (the public
  // picker) or a companion the caller owns — see canAccessCompanion.
  companions: router({
    listCurated: publicProcedure.query(() => listCuratedCompanions()),
    // --- Billing: the weekly paywall (server/companionBilling.ts) ---
    // Browsing companions is free; sendMessage / speak / startVideoSession
    // below all require an active subscription. Self-avatar companions are
    // gated the same way for now — revisit if self-avatar creation ever
    // gets its own separate fee.
    subscription: protectedProcedure.query(({ ctx }) => getCompanionAccessSummary(ctx.user.id)),
    subscribe: protectedProcedure.mutation(async ({ ctx }) => {
      const origin = ctx.req.headers.origin || "https://lensflow.au";
      const checkoutUrl = await createCompanionCheckout(ctx.user.id, ctx.user.email ?? undefined, origin);
      return { checkoutUrl };
    }),
    manageBilling: protectedProcedure.mutation(async ({ ctx }) => {
      const origin = ctx.req.headers.origin || "https://lensflow.au";
      return { url: await createCompanionBillingPortal(ctx.user.id, origin) };
    }),
    get: publicProcedure.input(z.object({ companionId: z.number().int().positive() })).query(async ({ input }) => {
      const companion = await getCompanion(input.companionId);
      if (!companion || !isPubliclyVisibleCompanion(companion)) return null;
      return companion;
    }),
    myConversations: protectedProcedure.query(({ ctx }) => listMyConversations(ctx.user.id)),
    // Opens (or creates) the conversation and returns its recent history —
    // call this when a user taps into a companion's chat screen.
    getMessages: protectedProcedure.input(z.object({ companionId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const companion = await getCompanion(input.companionId);
      if (!companion || !canAccessCompanion(companion, ctx.user.id)) throw new Error("You don't have access to this companion");
      const conversation = await getOrCreateConversation(ctx.user.id, input.companionId);
      const messages = await listRecentMessages(conversation.id, 200);
      return { companion, conversation, messages };
    }),
    sendMessage: protectedProcedure.input(z.object({ companionId: z.number().int().positive(), content: z.string().min(1).max(4000) })).mutation(async ({ input, ctx }) => {
      if (!(await hasActiveCompanionAccess(ctx.user.id))) throw new Error("A LensFlow Companions subscription is required to chat.");
      return sendCompanionMessage(ctx.user.id, input.companionId, input.content);
    }),
    // Returns a data: URL rather than a static file — there's nowhere to
    // durably host generated audio in this deployment yet (same reason
    // creatorProfiles.avatarDataUrl stores images inline, see
    // drizzle/schema.ts). Fine for one-off playback of a single reply;
    // revisit if this needs to be cached or replayed later.
    speak: protectedProcedure.input(z.object({ companionId: z.number().int().positive(), text: z.string().min(1).max(2000) })).mutation(async ({ input, ctx }) => {
      if (!(await hasActiveCompanionAccess(ctx.user.id))) throw new Error("A LensFlow Companions subscription is required.");
      const companion = await getCompanion(input.companionId);
      if (!companion || !canAccessCompanion(companion, ctx.user.id)) throw new Error("You don't have access to this companion");
      if (!companion.elevenlabsVoiceId) throw new Error(`${companion.name} doesn't have a voice set up yet`);
      const audio = await synthesizeSpeech(companion.elevenlabsVoiceId, input.text);
      return { audioDataUrl: `data:audio/mpeg;base64,${audio.toString("base64")}` };
    }),
    // Self-avatar: the ONLY path that ever creates a companion from a
    // user-supplied photo, and only after verifyLiveness passes — which,
    // as of this commit, always throws (see server/selfAvatar.ts) until a
    // real liveness vendor is wired in. That's intentional, not a bug to
    // route around.
    myCompanion: protectedProcedure.query(({ ctx }) => getSelfAvatarCompanion(ctx.user.id)),
    createSelfAvatar: protectedProcedure.input(z.object({ sessionReference: z.string().min(1) })).mutation(async ({ input, ctx }) => {
      const existing = await getSelfAvatarCompanion(ctx.user.id);
      if (existing) throw new Error("You already have a self-avatar companion");
      const result = await verifyLiveness(input.sessionReference);
      if (!result.passed) throw new Error("Liveness check failed — please try again");
      await createSelfAvatarVerification(ctx.user.id, result.imageUrl, result.provider);
      const companionId = await createSelfAvatarCompanion(ctx.user.id, result.imageUrl);
      return { companionId };
    }),
    // Design your own: a synthetic portrait (nobody real — see
    // server/imageGen.ts) plus a personality and voice, saved private to
    // the user. Subscription-gated so the image-gen spend is only on
    // paying users.
    myDesigned: protectedProcedure.query(({ ctx }) => listDesignedCompanions(ctx.user.id)),
    designCompanion: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(40),
        tagline: z.string().max(60).optional(),
        personality: z.string().min(10).max(600),
        look: z.string().min(4).max(400),
        voiceId: z.string().min(1).max(64),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await hasActiveCompanionAccess(ctx.user.id))) throw new Error("A LensFlow Companions subscription is required to design a companion.");
        if (/\b(celebrity|famous|looks? (exactly )?like|based on|resembl|my ex|my girlfriend|my wife|photo of)\b/i.test(input.look)) {
          throw new Error("Describe the look you want — she has to be a fictional person, not based on anyone real.");
        }
        const avatarImageUrl = await generateCompanionPortrait(input.look);
        const companionId = await createDesignedCompanion(ctx.user.id, {
          name: input.name.trim(),
          tagline: (input.tagline ?? "Yours").trim(),
          personality: input.personality.trim(),
          avatarImageUrl,
          elevenlabsVoiceId: input.voiceId,
        });
        return { companionId };
      }),
    deleteDesigned: protectedProcedure.input(z.object({ companionId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      await deleteDesignedCompanion(ctx.user.id, input.companionId);
      return { ok: true } as const;
    }),
    // Mints an Anam session token for video mode (server/anam.ts). The
    // companion's Claude+memory brain still runs via sendMessage; the
    // client just pipes each reply to the Anam avatar to speak.
    startVideoSession: protectedProcedure.input(z.object({ companionId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      if (!(await hasActiveCompanionAccess(ctx.user.id))) throw new Error("A LensFlow Companions subscription is required.");
      const companion = await getCompanion(input.companionId);
      if (!companion || !canAccessCompanion(companion, ctx.user.id)) throw new Error("You don't have access to this companion");
      if (!companion.anamAvatarId || !companion.anamVoiceId) throw new Error(`${companion.name} doesn't have video set up yet`);
      const sessionToken = await createAnamSessionToken({ name: companion.name, avatarId: companion.anamAvatarId, voiceId: companion.anamVoiceId });
      return { sessionToken };
    }),
  }),
});

export type AppRouter = typeof appRouter;
