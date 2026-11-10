/**
 * POST /api/payments/giftcard/cancel
 *
 * Customer cancels an awaiting-payment gift-card order. The UUID-keyed,
 * clearance-gated `cancel_order` RPC (anon key, no service_role) cancels it.
 *
 * Body: { orderId }  — orderId is the order UUID (the capability).
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

    const { cancelled, error } = await cancelOrder(orderId);
    if (error) {
      if (error.includes("order_not_found")) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      console.error("giftcard/cancel failed:", error);
      return NextResponse.json({ error: "Failed to cancel order" }, { status: 500 });
    }
    if (!cancelled) {
      return NextResponse.json({ error: "Cannot cancel an order at this stage" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Gift-card cancel error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
