// Coinbase Commerce integration for crypto checkout (BTC, ETH, USDC, and
// whatever else the merchant's Coinbase Commerce account has enabled).
// There's no officially-maintained Node SDK for Commerce, so this is a thin
// wrapper over its REST API directly — same shape as the Stripe integration
// elsewhere in this file set (server/routers.ts bookings.createCheckout):
// create a hosted charge, send the guest to its hosted_url, and only mark a
// booking paid once the webhook below confirms it — never trust the
// client-side redirect alone, the same reasoning as the existing Stripe flow.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "./_core/env";

const COMMERCE_API_BASE = "https://api.commerce.coinbase.com";

export type CoinbaseCharge = { id: string; hostedUrl: string };

export async function createCoinbaseCharge(input: {
  name: string;
  description: string;
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
  redirectUrl: string;
  cancelUrl: string;
}): Promise<CoinbaseCharge> {
  if (!ENV.coinbaseCommerceApiKey) throw new Error("Crypto checkout is not configured — set COINBASE_COMMERCE_API_KEY");
  const response = await fetch(`${COMMERCE_API_BASE}/charges`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": ENV.coinbaseCommerceApiKey,
      "X-CC-Version": "2018-03-22",
    },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      pricing_type: "fixed_price",
      // Coinbase Commerce prices in a real-world currency and lets the payer
      // choose which crypto to pay it in at checkout — there's no separate
      // "amount in BTC" to compute here.
      local_price: { amount: (input.amountCents / 100).toFixed(2), currency: input.currency },
      metadata: input.metadata,
      redirect_url: input.redirectUrl,
      cancel_url: input.cancelUrl,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Coinbase Commerce charge creation failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const json: any = await response.json();
  return { id: json.data.id, hostedUrl: json.data.hosted_url };
}

// Coinbase Commerce signs webhook bodies with HMAC-SHA256 of the *raw*
// request body, keyed with the per-account webhook shared secret, sent as a
// hex string in the X-CC-Webhook-Signature header. Verify with a
// constant-time comparison — same reasoning as any webhook signature check
// (see server/stripeWebhook.ts, which gets this for free from the Stripe SDK).
export function verifyCoinbaseWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined, sharedSecret: string): boolean {
  if (!signatureHeader) return false;
  const expectedHex = createHmac("sha256", sharedSecret).update(rawBody).digest("hex");
  let expectedBuf: Buffer;
  let gotBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expectedHex, "hex");
    gotBuf = Buffer.from(signatureHeader, "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length !== gotBuf.length) return false;
  return timingSafeEqual(expectedBuf, gotBuf);
}
