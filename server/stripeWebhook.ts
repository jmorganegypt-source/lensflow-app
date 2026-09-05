import Stripe from "stripe";
import type { Request, Response } from "express";
import { markBookingPaid, recordStripeEvent, updateCompanionSubscriptionByStripeId, upsertCompanionSubscription } from "./db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

export function isStripeTestEvent(event: Stripe.Event) {
  return event.id.startsWith("evt_test_");
}

export async function applyCheckoutCompleted(sessionId: string, paymentIntentId: string | undefined, deps = { markBookingPaid }) {
  await deps.markBookingPaid(sessionId, paymentIntentId);
}

// current_period_end sits on the subscription in older Stripe API versions
// and on the first subscription item in newer ones — check both.
function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const raw = (sub as any).current_period_end ?? (sub as any).items?.data?.[0]?.current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}

const COMPANION_SUB_STATUSES = ["incomplete", "trialing", "active", "past_due", "canceled", "unpaid"] as const;
function normalizeSubStatus(status: string): (typeof COMPANION_SUB_STATUSES)[number] {
  return (COMPANION_SUB_STATUSES as readonly string[]).includes(status) ? (status as any) : "incomplete";
}

async function applyCompanionSubscriptionCheckout(session: Stripe.Checkout.Session) {
  const userId = Number(session.metadata?.user_id || session.client_reference_id);
  if (!Number.isFinite(userId)) return;
  const subId = typeof session.subscription === "string" ? session.subscription : undefined;
  const customerId = typeof session.customer === "string" ? session.customer : undefined;
  let status: (typeof COMPANION_SUB_STATUSES)[number] = "active";
  let currentPeriodEnd: Date | null = null;
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      status = normalizeSubStatus(sub.status);
      currentPeriodEnd = subscriptionPeriodEnd(sub);
    } catch {
      /* keep the optimistic "active" — subscription.updated will correct it */
    }
  }
  await upsertCompanionSubscription(userId, { stripeCustomerId: customerId, stripeSubscriptionId: subId, status, currentPeriodEnd });
}

export async function handleStripeWebhook(req: Request, res: Response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];

  if (!secret) {
    console.error("[Stripe] Webhook secret is not configured");
    return res.status(503).json({ error: "Stripe webhook is not configured" });
  }

  if (typeof signature !== "string") {
    return res.status(400).json({ error: "Missing Stripe signature" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, secret);
  } catch (error) {
    console.error("[Stripe] Webhook signature verification failed", error);
    return res.status(400).json({ error: "Invalid Stripe signature" });
  }

  const firstReceipt = await recordStripeEvent(event.id, event.type);
  if (!firstReceipt) return res.json({ received: true, duplicate: true });

  if (isStripeTestEvent(event)) {
    console.log("[Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.metadata?.kind === "companion_sub") {
        await applyCompanionSubscriptionCheckout(session);
        console.log("[Stripe] Companion subscription started", { id: event.id, checkoutSessionId: session.id });
      } else {
        await applyCheckoutCompleted(session.id, typeof session.payment_intent === "string" ? session.payment_intent : undefined);
        console.log("[Stripe] Booking paid", { id: event.id, checkoutSessionId: session.id, created: event.created });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      if (sub.metadata?.kind === "companion_sub") {
        const status = event.type === "customer.subscription.deleted" ? "canceled" : normalizeSubStatus(sub.status);
        await updateCompanionSubscriptionByStripeId(sub.id, { status, currentPeriodEnd: subscriptionPeriodEnd(sub) });
        console.log("[Stripe] Companion subscription", event.type, { id: event.id, status });
      }
      break;
    }
    case "payment_intent.succeeded":
    case "invoice.paid":
    case "customer.created":
      console.log("[Stripe] Event received", {
        type: event.type,
        id: event.id,
        created: event.created,
      });
      break;
    default:
      console.log("[Stripe] Unhandled event received", {
        type: event.type,
        id: event.id,
        created: event.created,
      });
  }

  return res.json({ received: true });
}
