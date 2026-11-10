/**
 * GET /api/payments/crypto/status?orderId=UUID
 *
 * Browser polling. Reads the order via the UUID-keyed `get_order_public` RPC
 * (anon key, no service_role) — the UUID is the capability, and only non-secret
 * fields are returned. Status is driven by the IPN webhook + cron.
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrderPublic } from "@/app/lib/orders.rpc";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

  const order = await getOrderPublic(orderId);
  if (!order || order.payment_method !== "crypto") {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    serverNow: order.server_now,
    sessionExpired: order.session_expired,
    reconciliationPending: order.reconciliation_pending,
    reconciliationUntil: order.reconciliation_until,
    invoiceId: order.invoice_id ?? null,
    planName: order.plan_name,
    planPrice: order.plan_price,
    connections: order.connections,
    paymentMethod: order.payment_method,
    createdAt: order.created_at,
    sessionExpiresAt: order.session_expires_at || null,
  });
}
