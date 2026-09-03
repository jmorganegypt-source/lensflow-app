import Stripe from "stripe";
import type { Request, Response } from "express";
import { markBookingPaid, recordStripeEvent } from "./db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

export function isStripeTestEvent(event: Stripe.Event) {
  return event.id.startsWith("evt_test_");
}

export async function applyCheckoutCompleted(sessionId: string, paymentIntentId: string | undefined, deps = { markBookingPaid }) {
  await deps.markBookingPaid(sessionId, paymentIntentId);
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
      await applyCheckoutCompleted(session.id, typeof session.payment_intent === "string" ? session.payment_intent : undefined);
      console.log("[Stripe] Booking paid", { id: event.id, checkoutSessionId: session.id, created: event.created });
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
