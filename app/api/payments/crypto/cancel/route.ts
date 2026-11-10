/**
 * POST /api/payments/crypto/cancel
 *
 * Customer cancels a NOT-YET-PAID crypto order. Goes through the UUID-keyed,
 * clearance-gated `cancel_order` RPC (anon key, no service_role), which cancels
 * ONLY `awaiting_payment` orders — it refuses `processing` (payment detected) and
 * `pending` (payment received, under manual review) so a paid/settling order can
 * never be dropped. Returns 409 in that case. Body: { orderId }.
 */
import { NextRequest, NextResponse } from "next/server";
import { cancelOrder } from "@/app/lib/orders.rpc";
import { readJsonCapped } from "@/app/lib/customer-input";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonCapped(req, 1024);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const { orderId } = body as { orderId?: string };
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const { cancelled, status, orderNumber, error } = await cancelOrder(orderId);
    if (error) {
      if (error.includes("order_not_found")) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      console.error("crypto/cancel failed:", error);
      return NextResponse.json({ error: "Failed to cancel order" }, { status: 500 });
    }
    if (!cancelled) {
      return NextResponse.json({ error: `Order is already ${status}` }, { status: 409 });
    }

    console.log(`Order #${orderNumber} cancelled by user`);
    return NextResponse.json({ success: true, orderNumber });
  } catch (err) {
    console.error("Cancel endpoint error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
