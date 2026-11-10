/**
 * POST /api/payments/paypal/confirm
 *
 * Customer finished the TxnID step (Skip or Confirm). Moves the order
 * awaiting_payment → pending through the clearance-gated `confirm_paypal_order`
 * RPC (anon key, no service_role) and sends the confirmation email.
 *
 * Body: { orderId, txnId? }  — orderId is the order UUID (the capability).
 *
 * If the order is no longer 'awaiting_payment' (cancelled by cron/customer, or a
 * double-submit) the RPC returns confirmed:false → 409 and NO email is sent.
 */
import { NextRequest, NextResponse } from "next/server";
import { confirmPaypalOrder } from "@/app/lib/orders.rpc";
import { readJsonCapped } from "@/app/lib/customer-input";
import { sendOrderReceipt } from "@/app/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonCapped(req, 1024);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const { orderId, txnId } = body as { orderId?: string; txnId?: string };
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const { result, error } = await confirmPaypalOrder(orderId, txnId);
    if (error) {
      if (error.includes("order_not_found")) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      console.error("paypal/confirm failed:", error);
      return NextResponse.json({ error: "Failed to confirm order" }, { status: 500 });
    }
    if (!result?.confirmed) {
      return NextResponse.json({ error: "Order is no longer awaiting payment" }, { status: 409 });
    }

    // Confirmation email — cooldown-gated; never fails the confirmation.
    await sendOrderReceipt(result.order ?? {}, "PayPal");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("paypal/confirm error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
