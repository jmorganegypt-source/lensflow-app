// The /companions weekly paywall. Uses the same Stripe account/secret as
// the creator-side bookings (server/routers.ts), but this is a recurring
// subscription, not a one-off — and its money is 100% platform, kept
// entirely separate from the 81/19 creator split.
//
// Access decisions read companion_subscriptions.status (mirrors Stripe's
// own status via the webhook, server/stripeWebhook.ts). The price is built
// inline per checkout from ENV.companionPrice* — no pre-created Stripe
// Price object to keep in sync.
import Stripe from "stripe";
import { ENV } from "./_core/env";
import { getCompanionSubscription, hasActiveCompanionAccess } from "./db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

export { hasActiveCompanionAccess };

/** Everything the client needs to render the paywall vs. the chat. */
export async function getCompanionAccessSummary(userId: number) {
  const sub = await getCompanionSubscription(userId);
  const active = !!sub && (sub.status === "active" || sub.status === "trialing");
  return {
    active,
    status: sub?.status ?? "none",
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    priceCents: ENV.companionPriceCents,
    currency: ENV.companionPriceCurrency,
    canManageBilling: !!sub?.stripeCustomerId,
  };
}

/** Opens a Stripe Checkout in subscription mode. Returns the hosted URL. */
export async function createCompanionCheckout(userId: number, email: string | undefined, origin: string) {
  if (await hasActiveCompanionAccess(userId)) throw new Error("You already have an active Companions subscription");
  const existing = await getCompanionSubscription(userId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: existing?.stripeCustomerId || undefined,
    customer_email: existing?.stripeCustomerId ? undefined : email,
    client_reference_id: String(userId),
    metadata: { kind: "companion_sub", user_id: String(userId) },
    subscription_data: { metadata: { kind: "companion_sub", user_id: String(userId) } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: ENV.companionPriceCurrency,
          unit_amount: ENV.companionPriceCents,
          recurring: { interval: "week" },
          product_data: { name: "LensFlow Companions", description: "Unlimited chat, voice and video with every LensFlow Companion." },
        },
      },
    ],
    success_url: `${origin}/companions?sub=success`,
    cancel_url: `${origin}/companions?sub=cancelled`,
  });
  return session.url;
}

/** Stripe-hosted billing portal so a subscriber can update card / cancel. */
export async function createCompanionBillingPortal(userId: number, origin: string) {
  const sub = await getCompanionSubscription(userId);
  if (!sub?.stripeCustomerId) throw new Error("There's no subscription to manage yet");
  const portal = await stripe.billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: `${origin}/companions` });
  return portal.url;
}
