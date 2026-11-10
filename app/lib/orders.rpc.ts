/**
 * Server-authorized order access over Supabase anonymous-key transport.
 *
 * The app holds only the PUBLIC anon key. All order writes go through
 * SECURITY DEFINER RPCs that validate everything internally:
 *   - checkout_dispatch    → action/payload HMAC signed by this server
 *   - create_order          → PoW + captcha gated (customer checkout)
 *   - update_order_reference → HMAC-clearance gated (route, after invoice)
 *   - apply_order_status     → HMAC-clearance gated (webhooks / cron)
 * A bot with the anon key cannot forge the clearances (server-only secrets).
 *
 * SERVER-ONLY: uses node crypto + server-only secrets fetched from the Core
 * Backend (see runtime-config). Never import from a client component.
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { cfg } from "./runtime-config";
import { checkoutRpc } from './checkout-rpc';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const paymentDb = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Clearance helpers (must match the DB RPCs' HMAC formulas) ──
// The HMAC secrets are DYNAMIC (app_secrets → fetched at runtime), so these are
// async. Rotating a secret takes effect without redeploying the checkout.
export async function captchaClearance(token: string): Promise<string> {
  return createHmac("sha256", await cfg("CAPTCHA_CLEARANCE_HMAC")).update(token).digest("hex");
}
async function orderRefClearance(orderNumber: number): Promise<string> {
  return createHmac("sha256", await cfg("ORDER_UPDATE_HMAC")).update(String(orderNumber)).digest("hex");
}
async function orderStatusClearance(orderNumber: number, status: string): Promise<string> {
  return createHmac("sha256", await cfg("ORDER_UPDATE_HMAC")).update(`${orderNumber}:${status}`).digest("hex");
}
// Customer-facing PayPal actions are authorised by the order's UUID (an
// unguessable capability only the creating browser received). The clearance
// proves the server — not a raw anon client — is invoking the RPC.
async function orderIdClearance(orderId: string): Promise<string> {
  return createHmac("sha256", await cfg("ORDER_UPDATE_HMAC")).update(orderId).digest("hex");
}

export interface CreatedOrder {
  id: string;
  order_number: number;
  plan_price: number;
  plan_name: string;
  connections: number;
  payment_method: string;
  session_expires_at: string;
}

/** Create an order via the PoW/captcha-gated RPC. `order` is a plain object of
 *  whitelisted columns (site_name, customer_*, plan_*, connections, device_type,
 *  has_iptv_player, panel_type, payment_method, paypal_email, session_expires_at,
 *  status). Extensible: add a column to `order`, no signature change. */
export async function createOrder(args: {
  token: string;
  nonce: string;
  captchaClearance?: string | null;
  order: Record<string, unknown>;
}): Promise<{ order: CreatedOrder | null; error: string | null }> {
  const { data, error } = await checkoutRpc("create_order_v3", {
    p_token: args.token,
    p_nonce: args.nonce,
    p_clearance: args.captchaClearance ?? null,
    p_order: args.order,
  });
  if (error) return { order: null, error: error.message };
  return { order: data as CreatedOrder, error: null };
}

/** Store the external invoice reference after creating it (route, post-invoice). */
export async function updateOrderReference(
  orderNumber: number,
  paymentReference: unknown,
  paypalEmail?: string | null,
): Promise<string | null> {
  const { error } = await checkoutRpc("update_order_reference", {
    p_order_number: orderNumber,
    p_payment_reference: paymentReference ?? null,
    p_paypal_email: paypalEmail ?? null,
    p_clearance: await orderRefClearance(orderNumber),
  });
  return error ? error.message : null;
}

export interface ApplyStatusResult {
  applied: boolean;
  previous_status: string;
  status: string;
  order: Record<string, unknown>;
}

/**
 * Apply a status transition (webhooks / cron). Clearance-gated + monotonic:
 * forward-only along awaiting_payment → processing → pending;
 * 'completed' is admin-only; 'cancelled' is an exit only from awaiting_payment (and a cancelled order can still be resurrected forward if
 * a late payment arrives). A no-op transition returns applied=false so callers
 * skip duplicate emails. Returns the order fields (for the email) too.
 */
export async function applyOrderStatus(
  orderNumber: number,
  status: string,
  opts?: {
    paymentReference?: unknown;
    paypalTxnId?: string | null;
  },
): Promise<{ result: ApplyStatusResult | null; error: string | null }> {
  const { data, error } = await checkoutRpc("apply_order_status", {
    p_order_number: orderNumber,
    p_status: status,
    p_payment_reference: opts?.paymentReference ?? null,
    p_paypal_txn_id: opts?.paypalTxnId ?? null,
    p_clearance: await orderStatusClearance(orderNumber, status),
  });
  if (error) return { result: null, error: error.message };
  return { result: data as ApplyStatusResult, error: null };
}

/** Safe public subset of a site's config (no secret keys), via anon RPC. */
export async function getPublicSiteConfig(
  siteName: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await paymentDb.rpc("get_public_site_config", { p_site_name: siteName });
  return (data as Record<string, unknown> | null) ?? null;
}

/** Clearance-gated read of an order (webhooks/cron that must inspect before updating). */
export async function getOrder(
  orderNumber: number,
): Promise<{ order: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await checkoutRpc("get_order", {
    p_order_number: orderNumber,
    p_clearance: await orderRefClearance(orderNumber),
  });
  if (error) return { order: null, error: error.message };
  return { order: (data as Record<string, unknown> | null) ?? null, error: null };
}

/** List expired unpaid orders for the cron (clearance-gated). */
export async function listExpiredOrders(): Promise<Record<string, unknown>[]> {
  const clearance = createHmac("sha256", await cfg("ORDER_UPDATE_HMAC")).update("cron:expired").digest("hex");
  const { data, error } = await checkoutRpc("list_expired_orders", { p_clearance: clearance });
  if (error) {
    console.error("list_expired_orders failed:", error.message);
    throw new Error("Expired orders unavailable");
  }
  return (data as Record<string, unknown>[]) ?? [];
}

// ── PayPal: smart-rotation assignment + customer confirm/cancel ──

/** Pick + assign the best active PayPal account to a fresh awaiting_payment order.
 *  Returns the chosen email, or null when no account is available. */
export async function assignPaypalAccount(
  orderId: string,
): Promise<{ paypalEmail: string | null; error: string | null }> {
  const { data, error } = await checkoutRpc("assign_paypal_account", {
    p_order_id: orderId,
    p_clearance: await orderIdClearance(orderId),
  });
  if (error) return { paypalEmail: null, error: error.message };
  const email = (data as { paypal_email?: string | null } | null)?.paypal_email ?? null;
  return { paypalEmail: email, error: null };
}

export interface ConfirmPaypalResult {
  confirmed: boolean;
  status?: string;
  order?: Record<string, unknown>;
}

/** Move a PayPal order awaiting_payment → pending (customer says they paid).
 *  `confirmed:false` means the order was no longer awaiting_payment (no email). */
export async function confirmPaypalOrder(
  orderId: string,
  txnId?: string | null,
): Promise<{ result: ConfirmPaypalResult | null; error: string | null }> {
  const { data, error } = await checkoutRpc("confirm_paypal_order", {
    p_order_id: orderId,
    p_txn_id: txnId ?? null,
    p_clearance: await orderIdClearance(orderId),
  });
  if (error) return { result: null, error: error.message };
  return { result: data as ConfirmPaypalResult, error: null };
}

/** Cancel a NOT-YET-PAID order (awaiting_payment only) by UUID — crypto
 *  or paypal. The RPC refuses pending/completed/cancelled (returns cancelled:false)
 *  so a received/under-review payment can never be dropped. Frees the PayPal slot
 *  when applicable. `cancelled:false` returns the current status for a 409/400. */
export async function cancelOrder(
  orderId: string,
): Promise<{ cancelled: boolean; status?: string; orderNumber?: number; error: string | null }> {
  const { data, error } = await checkoutRpc("cancel_order", {
    p_order_id: orderId,
    p_clearance: await orderIdClearance(orderId),
  });
  if (error) return { cancelled: false, error: error.message };
  const d = data as { cancelled?: boolean; status?: string; order_number?: number } | null;
  return { cancelled: !!d?.cancelled, status: d?.status, orderNumber: d?.order_number, error: null };
}

/** Safe, UUID-keyed status read for browser polling (no PII beyond the order's
 *  own customer_email; no provider secrets). Returns null when not found. */
export async function getOrderPublic(orderId: string): Promise<Record<string, unknown> | null> {
  if (typeof orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) return null;
  const { data, error } = await checkoutRpc("get_order_public", { p_order_id: orderId });
  if (error) {
    console.error("get_order_public failed:", error.message);
    throw new Error("Order storage unavailable");
  }
  return (data as Record<string, unknown> | null) ?? null;
}

/** Best-effort save of the customer's PayPal transaction id (while order open). */
export async function savePaypalTxn(orderId: string, txnId?: string | null): Promise<string | null> {
  const { error } = await checkoutRpc("save_paypal_txn", {
    p_order_id: orderId,
    p_txn_id: txnId ?? null,
    p_clearance: await orderIdClearance(orderId),
  });
  return error ? error.message : null;
}

// ── Generic manual-payment submission (gift card, and any future manual method) ──

export interface SubmitManualResult {
  confirmed: boolean;
  status?: string;
  order?: Record<string, unknown>;
}

/**
 * Submit the customer's proof for a manual payment method (e.g. the gift-card
 * code) by UUID capability. Merges `reference` into the order's payment_reference
 * and moves awaiting_payment → pending. `confirmed:false` means the order was no
 * longer awaiting_payment (double-submit / cancelled) → no email. Reusable for
 * additional manual methods — just pass a different `reference` shape. */
export async function submitManualPayment(
  orderId: string,
  reference: Record<string, unknown>,
): Promise<{ result: SubmitManualResult | null; error: string | null }> {
  const { data, error } = await checkoutRpc("submit_manual_payment", {
    p_order_id: orderId,
    p_reference: reference,
    p_clearance: await orderIdClearance(orderId),
  });
  if (error) return { result: null, error: error.message };
  return { result: data as SubmitManualResult, error: null };
}
