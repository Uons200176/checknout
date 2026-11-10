/**
 * NOWPayments gateway module.
 *
 * Talks to the NOWPayments REST API directly
 * and adds IPN signature verification.
 *
 * ⚠️  Server-only — never import from client components.
 */
/**
 * NOWPayments REST base.
 *
 * The official SDK used to wrap these three calls, but it pins an old axios
 * that npm reports as unfixable (23 high advisories, "No fix available"),
 * because the fix lives in a dependency the SDK controls and not in us.
 *
 * Only two methods were ever used and this file already called the REST API
 * directly for a third, so the SDK was carrying a vulnerable HTTP client into
 * the payment path in exchange for almost nothing.
 */
const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";
import crypto from "crypto";
import { cfg } from "./runtime-config";

// No module-level SDK instance: the API key is dynamic (app_secrets), so every
// call builds a client with the key resolved at request time.

// ── Invoice creation helper ─────────────────────────────────────────────
export interface CreateInvoiceParams {
    /** Our internal order number (e.g. 1105) */
    orderNumber: number;
    /** Amount in the site's fiat currency (default USD) */
    priceAmount: number;
    /** ISO fiat currency code (e.g. "USD", "EUR") — defaults to USD */
    priceCurrency?: string;
    /** URL where IPN callbacks are sent */
    ipnCallbackUrl: string;
    /** URL the customer returns to after payment */
    successUrl: string;
    /** URL the customer returns to if they cancel */
    cancelUrl: string;
}

/** The subset of the NOWPayments invoice response we rely on. */
export interface CryptoInvoice {
    id: string | number;
    invoice_url: string;
    order_id: string;
    price_amount: number;
    price_currency: string;
}

export async function createCryptoInvoice(
    params: CreateInvoiceParams
): Promise<CryptoInvoice> {
    const key = await cfg("NOWPAYMENTS_API_KEY");

    const res = await fetch(`${NOWPAYMENTS_API}/invoice`, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
            "x-api-key": key,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            price_amount: params.priceAmount,
            price_currency: (params.priceCurrency || "usd").toLowerCase(),
            order_id: String(params.orderNumber),
            order_description: `Order #${params.orderNumber}`,
            ipn_callback_url: params.ipnCallbackUrl,
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
        }),
    });

    if (!res.ok) {
        // Surface the API's own message: it names the actual cause (a bad key,
        // an unsupported currency, an amount below the minimum), which a
        // generic "invoice failed" would hide at the exact moment a customer is
        // trying to pay.
        const text = await res.text();
        throw new Error(`NOWPayments createInvoice failed (${res.status}): ${text}`);
    }

    return (await res.json()) as CryptoInvoice;
}

// ── IPN signature verification ──────────────────────────────────────────
/**
 * Verifies the HMAC SHA-512 signature sent by NOWPayments in
 * the `x-nowpayments-sig` header.
 *
 * Steps (per NOWPayments docs):
 *  1. Sort the webhook body keys alphabetically
 *  2. JSON.stringify the sorted object
 *  3. HMAC-SHA512 with the IPN secret
 *  4. Compare with the received signature
 */
export function verifyIpnSignature(
    body: Record<string, unknown>,
    receivedSig: string,
    secret: string
): boolean {
    if (!receivedSig || !secret) return false;

    // 1. Sort keys alphabetically
    const sorted = sortObjectKeys(body);

    // 2. Stringify
    const payload = JSON.stringify(sorted);

    // 3. HMAC-SHA512
    const hmac = crypto
        .createHmac("sha512", secret)
        .update(payload)
        .digest("hex");

    // 4. Constant-time comparison
    try {
        return crypto.timingSafeEqual(
            Buffer.from(hmac, "hex"),
            Buffer.from(receivedSig, "hex")
        );
    } catch {
        return false;
    }
}

/** Deep-sort an object's keys alphabetically (recursive). */
function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(obj).sort()) {
        const val = obj[key];
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            sorted[key] = sortObjectKeys(val as Record<string, unknown>);
        } else {
            sorted[key] = val;
        }
    }

    return sorted;
}

// ── NOWPayments status → our order status mapping ───────────────────────
export type NowPaymentStatus =
    | "waiting"
    | "confirming"
    | "confirmed"
    | "sending"
    | "partially_paid"
    | "finished"
    | "failed"
    | "refunded"
    | "expired";

export type OrderStatusResult = "pending" | "cancelled" | "processing" | null;

/**
 * Maps a NOWPayments payment status to our internal order status.
 *
 * IMPORTANT: a fully-paid invoice maps to `pending`, NOT `completed`. `pending`
 * means "payment received — awaiting the team to verify and send the account".
 * Only the admin sets `completed` (manually, after delivering the account), so a
 * confirmed payment can never skip verification.
 *
 * Returns `null` when no update is needed (e.g. still `waiting` — the order is
 * already `awaiting_payment`).
 */
export function mapPaymentStatus(npStatus: string): OrderStatusResult {
    switch (npStatus) {
        case "finished":
        case "confirmed":
            return "pending"; // paid in full → awaiting manual verification + delivery

        case "failed":
        case "refunded":
        case "expired":
            return "cancelled";

        case "confirming":
        case "sending":
        case "partially_paid":
            return "processing"; // payment detected / not yet fully settled

        case "waiting":
        default:
            return null; // no change — order stays awaiting_payment
    }
}

/** Authenticated reconciliation for the ID recorded by a verified webhook. */
export async function getPaymentStatus(paymentId: string): Promise<Record<string, unknown>> {
    if (!/^\d+$/.test(paymentId)) throw new Error("Invalid payment ID");
    const res = await fetch(`${NOWPAYMENTS_API}/payment/${paymentId}`, {
        headers: { "x-api-key": await cfg("NOWPAYMENTS_API_KEY") },
        cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`NOWPayments status failed (${res.status})`);
    return await res.json();
}
