import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { applyCheckoutCompleted, handleStripeWebhook, isStripeTestEvent } from "./stripeWebhook";

describe("Booking payment state updates", () => {
  it("marks the linked booking as paid when checkout completes", async () => {
    const markBookingPaid = vi.fn().mockResolvedValue(undefined);
    await applyCheckoutCompleted("cs_test_123", "pi_test_456", { markBookingPaid });
    expect(markBookingPaid).toHaveBeenCalledTimes(1);
    expect(markBookingPaid).toHaveBeenCalledWith("cs_test_123", "pi_test_456");
  });

  it("marks the booking as paid even without a payment intent id", async () => {
    const markBookingPaid = vi.fn().mockResolvedValue(undefined);
    await applyCheckoutCompleted("cs_test_789", undefined, { markBookingPaid });
    expect(markBookingPaid).toHaveBeenCalledWith("cs_test_789", undefined);
  });

  it("processes a full checkout.session.completed webhook and updates the booking", async () => {
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const sessionId = "cs_live_integration_test";
    const paymentIntentId = "pi_live_integration_test";
    const payload = JSON.stringify({
      id: "evt_live_checkout_completed",
      object: "event",
      api_version: "2025-03-31.basil",
      created: 1,
      data: { object: { id: sessionId, object: "checkout.session", payment_intent: paymentIntentId } },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "checkout.session.completed",
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await handleStripeWebhook(
      { body: Buffer.from(payload), headers: { "stripe-signature": signature } } as any,
      { status, json } as any,
    );
    expect(json).toHaveBeenCalledWith({ received: true });
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  });
});

describe("Stripe webhook helpers", () => {
  it("recognizes Stripe verification test events", () => {
    expect(isStripeTestEvent({ id: "evt_test_verification", object: "event" } as any)).toBe(true);
  });

  it("does not treat production events as verification tests", () => {
    expect(isStripeTestEvent({ id: "evt_live_payment", object: "event" } as any)).toBe(false);
  });

  it("verifies a signed test event and returns the required response", async () => {
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const payload = JSON.stringify({
      id: "evt_test_verification",
      object: "event",
      api_version: "2025-03-31.basil",
      created: 1,
      data: { object: {} },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "payment_intent.succeeded",
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await handleStripeWebhook(
      { body: Buffer.from(payload), headers: { "stripe-signature": signature } } as any,
      { status, json } as any,
    );
    expect(json).toHaveBeenCalledWith({ verified: true });
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  });
});
