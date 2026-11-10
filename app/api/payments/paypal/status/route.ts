/**
 * GET /api/payments/paypal/status?orderId=UUID
 *
 * Restores the paypal-pending page on mount. UUID-keyed anon RPC
 * (`get_order_public`) — no service_role. Phase is derived from `status`:
 *   awaiting_payment → instructions + timer; pending/completed → review;
 *   cancelled → expired screen.
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrderPublic } from "@/app/lib/orders.rpc";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

  const order = await getOrderPublic(orderId);
  if (!order || order.payment_method !== "paypal") {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({
    serverNow: order.server_now,
    status: order.status,
    orderNumber: order.order_number,
    planName: order.plan_name,
    planPrice: order.plan_price,
    connections: order.connections,
    paypalEmail: order.paypal_email,
    paypalTxnId: order.paypal_txn_id,
    customerEmail: order.customer_email,
    sessionExpiresAt: order.session_expires_at,
  }, { headers: { "Cache-Control": "no-store" } });
}
