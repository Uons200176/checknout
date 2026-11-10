/**
 * POST /api/webhooks/nowpayments
 *
 * NOWPayments IPN callback. Security + lifecycle:
 *  - Verifies HMAC SHA-512 signature (server-to-server, env secret).
 *  - Applies the status ONLY through the clearance-gated `apply_order_status`
 *    RPC (anon key, no service_role), which is monotonic + idempotent.
 *  - A fully-paid invoice moves the order to `pending` ("payment received —
 *    awaiting the team to verify + send the account"), NEVER straight to
 *    `completed`. Only the admin completes an order (after delivering it), so a
 *    confirmed payment can't skip verification. The "under review" email is sent
 *    exactly once, on the transition into `pending`.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIpnSignature, mapPaymentStatus } from "@/app/lib/nowpayments";
import { verifyNowPayment } from "@/app/lib/payment-verification";
import { getOrder, applyOrderStatus } from "@/app/lib/orders.rpc";
import { sendOrderReceipt } from "@/app/lib/email";
import { readJsonCapped } from "@/app/lib/customer-input";
import { cfg } from "@/app/lib/runtime-config";

export async function POST(req: NextRequest) {
  try {
    // Capped before parsing: the callback URL is not a secret, and the
    // signature is only checked AFTER the body is decoded. An IPN payload is
    // well under 8 KB. verifyIpnSignature takes the parsed object, so this is
    // a drop-in swap and the HMAC check is untouched.
    const body = await readJsonCapped(req);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const signature = req.headers.get("x-nowpayments-sig") || "";
    const ipnSecret = await cfg("NOWPAYMENTS_IPN_SECRET");

    if (!verifyIpnSignature(body, signature, ipnSecret)) {
      console.warn("IPN signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const { order_id, payment_status } = body as {
      order_id?: string | number; payment_status?: string;
    };
    if (!order_id || !payment_status) {
      return NextResponse.json({ error: "Missing required IPN fields" }, { status: 400 });
    }

    const orderNumber = Number(order_id);
    if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    const { order, error: readError } = await getOrder(orderNumber);
    if (readError || !order) return NextResponse.json({ error: "Order unavailable" }, { status: 503 });
    if (!verifyNowPayment(order, body)) return NextResponse.json({ error: "Payment reference mismatch" }, { status: 409 });
    const paymentReference = {
      payment_id: String(body.payment_id), payment_status, actually_paid: body.actually_paid,
      verified_at: new Date().toISOString(),
    };

    // finished/confirmed → pending, confirming/sending/partially_paid → processing,
    // failed/expired/refunded → cancelled, waiting → null (no change).
    const newStatus = mapPaymentStatus(payment_status);
    if (!newStatus) {
      // Retain the payment ID for later authenticated reconciliation.
      const { updateOrderReference } = await import("@/app/lib/orders.rpc");
      if (await updateOrderReference(orderNumber, paymentReference)) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
      return NextResponse.json({ ok: true });
    }

    const { result, error } = await applyOrderStatus(orderNumber, newStatus, { paymentReference });

    if (error) {
      if (error.includes("order_not_found")) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      console.error(`IPN: apply_order_status failed for ${order_id}:`, error);
      return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
    }

    console.log(`IPN: order ${order_id} → ${newStatus} (applied=${result?.applied})`);

    // "Payment received — under review" email, on entering pending. `applied`
    // is false for a replayed IPN, so this cannot fire twice for one order.
    if (result?.applied && newStatus === "pending") {
      await sendOrderReceipt(result.order, "Cryptocurrency");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
