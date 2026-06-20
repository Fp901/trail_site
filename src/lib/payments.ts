// Payments — processor-abstracted (Part 9.3). Paystack implementation via fetch (no SDK).
// Swap point: implement the same PaymentProcessor interface for PayFast/Peach/Adumo later.
// Secret key is read lazily so the build never fails without it.
import crypto from 'node:crypto';

export interface InitCheckoutInput {
  email: string;
  amountCents: number; // ZAR subunit (cents)
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}
export interface InitCheckoutResult {
  authorizationUrl: string;
  reference: string;
}
export interface VerifyResult {
  status: string; // "success" | "failed" | "abandoned" | ...
  amountCents: number;
  reference: string;
  transactionId: string;
  currency: string;
}

export interface PaymentProcessor {
  initCheckout(input: InitCheckoutInput): Promise<InitCheckoutResult>;
  verifyTransaction(reference: string): Promise<VerifyResult>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

const BASE = 'https://api.paystack.co';

function secretKey(): string {
  const key = import.meta.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not configured.');
  return key;
}

export const paystack: PaymentProcessor = {
  async initCheckout(input) {
    const res = await fetch(`${BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountCents,
        currency: 'ZAR',
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata ?? {},
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status || !json?.data?.authorization_url) {
      throw new Error(`Paystack initialize failed: ${json?.message ?? res.status}`);
    }
    return { authorizationUrl: json.data.authorization_url, reference: json.data.reference };
  },

  async verifyTransaction(reference) {
    const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey()}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status || !json?.data) {
      throw new Error(`Paystack verify failed: ${json?.message ?? res.status}`);
    }
    const d = json.data;
    return {
      status: String(d.status),
      amountCents: Number(d.amount),
      reference: String(d.reference),
      transactionId: String(d.id),
      currency: String(d.currency),
    };
  },

  // HMAC-SHA512 of the RAW body using the secret key (Part 11.4). Timing-safe compare.
  verifyWebhookSignature(rawBody, signature) {
    if (!signature) return false;
    const expected = crypto.createHmac('sha512', secretKey()).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  },
};

// Active processor — change this single binding to switch gateways.
export const payments: PaymentProcessor = paystack;
