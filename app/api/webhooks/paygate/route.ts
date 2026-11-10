/**
 * GET /api/webhooks/paygate
 *
 * PayGate.to IPN callback. Secured by the token embedded in the callback URL
 * (derived from PAYGATE_IPN_SECRET). Reads + updates the order ONLY through the
 * clearance-gated RPCs (anon key, no service_role).
 *
 * A confirmed payment moves the order to `pending` ("payment received — awaiting
 * the team to verify + send the account"), NEVER straight to `completed` (only
 * the admin completes an order after delivering it). Amount within 8% (card→crypto
 * fees) → `pending`; outside that → `processing` (manual review, no email).
 * Monotonic + duplicate-email-safe.
 */
import { NextRequest, NextResponse } from "next/server";
import { paygateReviewStatus } from "@/app/lib/payment-verification";
import { validateIpnToken } from "@/app/lib/paygate";
import { getOrder, applyOrderStatus } from "@/app/lib/orders.rpc";
import { sendOrderReceipt } from "@/app/lib/email";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const orderIdParam = params.get("orderId"); // now the order_number
    const token = params.get("token") || "";
    const valueCoin = params.get("value_coin") || "";
    const txidIn = params.get("txid_in") || "";
    const txidOut = params.get("txid_out") || "";
    const addressIn = params.get("address_in") || "";

    if (!orderIdParam) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    if (!(await validateIpnToken(token, orderIdParam))) {
      console.warn("PayGate IPN: invalid token");
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    const orderNumber = Number(orderIdParam);
    if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    const { order: o, error: readErr } = await getOrder(orderNumber);
    if (readErr || !o) {
      console.error(`PayGate IPN: order ${orderNumber} not found`, readErr);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (o.payment_method !== "card-crypto") {
      return NextResponse.json({ error: "Wrong payment method" }, { status: 400 });
    }
    if (o.status === "completed") {
      return NextResponse.json({ ok: true }); // idempotent + dup-email guard
    }

    // Fail-closed: ONLY a verified within-8% amount (card→crypto fees) reaches
    // 'pending' (+ receipt email). An absent / zero / non-numeric / out-of-range
    // amount routes to 'processing' (manual review, no email). Never auto-complete.
    const existing = (o.payment_reference ?? {}) as Record<string, unknown>;
    if (!existing.address_in || !txidIn || txidIn.length > 256) {
      return NextResponse.json({ error: "Payment reference unavailable" }, { status: 409 });
    }
    if (addressIn && addressIn !== existing.address_in && addressIn !== existing.polygon_address_in) {
      return NextResponse.json({ error: "Wallet mismatch" }, { status: 409 });
    }
    const newStatus = paygateReviewStatus(o, valueCoin);

    // Merge transaction details into the jsonb payment_reference.
    const existingRef = (o.payment_reference as Record<string, unknown> | null) ?? {};
    const paymentReference = {
      ...existingRef,
      txid_in: txidIn,
      txid_out: txidOut,
      callback_address_in: addressIn,
      value_coin: valueCoin,
      ipn_received_at: new Date().toISOString(),
    };

    const { result, error } = await applyOrderStatus(orderNumber, newStatus, { paymentReference });
    if (error) {
      if (error.includes("order_not_found")) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      console.error(`PayGate IPN: apply failed for ${orderNumber}:`, error);
      return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
    }
    console.log(`PayGate IPN: order ${orderNumber} → ${newStatus} (applied=${result?.applied})`);

    // "Payment received — under review" email only on a fresh pending (never for
    // 'processing'). Prefer the post-update row; `o` is the pre-update read.
    if (result?.applied && newStatus === "pending") {
      await sendOrderReceipt(result.order ?? o, "Card Payment");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PayGate webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
