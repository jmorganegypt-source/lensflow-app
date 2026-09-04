import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { verifyCoinbaseWebhookSignature } from "./coinbase";
import { markBookingPaidByCoinbaseCharge, recordCoinbaseEvent } from "./db";

export async function handleCoinbaseWebhook(req: Request, res: Response) {
  const secret = ENV.coinbaseCommerceWebhookSecret;
  const signature = req.headers["x-cc-webhook-signature"];

  if (!secret) {
    console.error("[Coinbase] Webhook shared secret is not configured");
    return res.status(503).json({ error: "Crypto checkout webhook is not configured" });
  }
  if (typeof signature !== "string") {
    return res.status(400).json({ error: "Missing Coinbase webhook signature" });
  }

  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody) || !verifyCoinbaseWebhookSignature(rawBody, signature, secret)) {
    console.error("[Coinbase] Webhook signature verification failed");
    return res.status(400).json({ error: "Invalid Coinbase webhook signature" });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const event = payload?.event;
  if (!event?.id || !event?.type) return res.status(400).json({ error: "Malformed event" });

  const firstReceipt = await recordCoinbaseEvent(event.id, event.type);
  if (!firstReceipt) return res.json({ received: true, duplicate: true });

  switch (event.type) {
    // "confirmed" = the chain has enough confirmations; "resolved" fires
    // for a charge that was under- or over-paid and Coinbase resolved it in
    // the merchant's favor. Either way, the booking is paid.
    case "charge:confirmed":
    case "charge:resolved": {
      const chargeId = event.data?.id;
      if (chargeId) {
        await markBookingPaidByCoinbaseCharge(chargeId);
        console.log("[Coinbase] Booking paid", { id: event.id, chargeId });
      }
      break;
    }
    case "charge:failed":
      console.log("[Coinbase] Charge failed", { id: event.id, chargeId: event.data?.id });
      break;
    case "charge:pending":
    case "charge:created":
      console.log("[Coinbase] Event received", { type: event.type, id: event.id });
      break;
    default:
      console.log("[Coinbase] Unhandled event received", { type: event.type, id: event.id });
  }

  return res.json({ received: true });
}
