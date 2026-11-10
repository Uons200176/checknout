/**
 * PayGate.to — Server-side API helpers
 *
 * Handles:
 *  1. Wallet creation  (GET wallet.php)
 *  2. Payment URL generation (checkout.paygate.to/process-payment.php)
 *  3. IPN callback validation
 *  4. Manual payment status check
 *
 * ⚠️  SERVER-ONLY — never import from client components.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { cfg } from "./runtime-config";

const PAYGATE_API_BASE = "https://api.paygate.to/control";
const PAYGATE_CHECKOUT_BASE = "https://checkout.paygate.to";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaygateWallet {
    address_in: string;       // Encrypted wallet address for the payment URL
    polygon_address_in: string; // Actual Polygon address for tracking
    ipn_token: string;        // Token for manual status checks
}

export interface PaygatePaymentParams {
    addressIn: string;    // The address_in from wallet creation (raw, as returned by wallet.php)
    amount: number;       // Amount to charge
    currency: string;     // Currency code (USD, EUR, etc.)
    email: string;        // Customer email
}

export interface PaygateIpnParams {
    value_coin?: string;
    coin?: string;
    txid_in?: string;
    txid_out?: string;
    address_in?: string;
}

export interface PaygateStatusResult {
    status: "paid" | "unpaid";
    value_coin?: string;
    txid_in?: string;
    txid_out?: string;
}

// ─── 1. Create Wallet ──────────────────────────────────────────────────────

/**
 * Step 1: Generate an encrypted wallet address for a single payment session.
 *
 * GET https://api.paygate.to/control/wallet.php
 *   ?address=<YOUR_USDC_WALLET>
 *   &callback=<URL_ENCODED_CALLBACK>
 */
export async function createPaygateWallet(callbackUrl: string): Promise<PaygateWallet> {
    const payoutWallet = await cfg("PAYGATE_PAYOUT_WALLET");
    if (!payoutWallet) {
        throw new Error("PAYGATE_PAYOUT_WALLET env var is not set");
    }

    const url = new URL(`${PAYGATE_API_BASE}/wallet.php`);
    url.searchParams.set("address", payoutWallet);
    url.searchParams.set("callback", callbackUrl);

    const res = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
        headers: { Accept: "application/json" },
    });

    if (!res.ok) {
        const text = await res.text();
        console.error("PayGate wallet.php error:", res.status, text);
        throw new Error(`PayGate wallet creation failed (${res.status})`);
    }

    const data = await res.json();

    if (!data.address_in) {
        console.error("PayGate wallet.php unexpected response:", data);
        throw new Error("PayGate wallet creation: missing address_in");
    }

    // Store address_in raw (as returned by wallet.php) — it's already URL-encoded.
    // We'll concatenate it directly into the payment URL to avoid double-encoding.
    return {
        address_in: data.address_in,
        polygon_address_in: data.polygon_address_in || data.address_in,
        ipn_token: data.ipn_token || "",
    };
}

// ─── 2. Build Payment URL (Multi-Provider Hosted Checkout) ─────────────────

/**
 * Step 2: Build the redirect URL to PayGate's hosted multi-provider checkout page.
 *
 * Uses pay.php (NOT process-payment.php) to show ALL available payment providers
 * with automatic geo-location detection for highest conversion.
 *
 * GET https://checkout.paygate.to/pay.php
 *   ?address=<address_in>
 *   &amount=<amount>
 *   &currency=<currency>
 *   &email=<email>
 */
export function buildPaymentUrl(params: PaygatePaymentParams): string {
    // Concatenate address_in directly — it's already URL-encoded from wallet.php.
    // Using URL.searchParams.set() would double-encode it.
    const base = `${PAYGATE_CHECKOUT_BASE}/pay.php`;
    return `${base}?address=${params.addressIn}&amount=${params.amount}&currency=${encodeURIComponent(params.currency)}&email=${encodeURIComponent(params.email)}`;
}

// ─── 3. Build IPN Callback URL ──────────────────────────────────────────────

/**
 * Per-order IPN token = HMAC(order_number, PAYGATE_IPN_SECRET).
 *
 * PayGate has no payload signature — the token in the callback URL is the only
 * auth. Deriving it PER ORDER (instead of embedding the raw shared secret) means
 * a token leaked from an access log can only forge the IPN for its own order,
 * never for arbitrary orders, and the raw secret never travels in a URL.
 */
async function ipnTokenFor(orderId: string): Promise<string> {
    return createHmac("sha256", await cfg("PAYGATE_IPN_SECRET")).update(orderId).digest("hex");
}

/**
 * Constructs the IPN callback URL with the order id and its per-order token.
 * PayGate will append its own query params (value_coin, txid_in, etc.) to this URL.
 */
export async function buildIpnCallbackUrl(orderId: string): Promise<string> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = new URL(`${appUrl}/api/webhooks/paygate`);
    url.searchParams.set("orderId", orderId);
    url.searchParams.set("token", await ipnTokenFor(orderId));
    return url.toString();
}

// ─── 4. Validate IPN Callback ──────────────────────────────────────────────

/**
 * Validates the IPN callback token against the per-order HMAC. Timing-safe.
 * Requires the order id (the token is bound to it).
 */
export async function validateIpnToken(receivedToken: string, orderId: string): Promise<boolean> {
    if (!(await cfg("PAYGATE_IPN_SECRET")) || !orderId) return false;
    const expected = await ipnTokenFor(orderId);
    if (!receivedToken || receivedToken.length !== expected.length) return false;

    try {
        return timingSafeEqual(Buffer.from(receivedToken), Buffer.from(expected));
    } catch {
        return false;
    }
}

// ─── 5. Manual Payment Status Check ─────────────────────────────────────────

/**
 * Check payment status manually using the ipn_token from wallet creation.
 *
 * GET https://api.paygate.to/control/payment-status.php?ipn_token=<token>
 */
export async function checkPaygateStatus(ipnToken: string): Promise<PaygateStatusResult> {
    const url = new URL(`${PAYGATE_API_BASE}/payment-status.php`);
    url.searchParams.set("ipn_token", ipnToken);

    const res = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
        headers: { Accept: "application/json" },
    });

    if (!res.ok) {
        const text = await res.text();
        console.error("PayGate status check error:", res.status, text);
        throw new Error(`PayGate status check failed (${res.status})`);
    }

    return res.json();
}
