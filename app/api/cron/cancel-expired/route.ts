/**
 * GET /api/cron/cancel-expired
 *
 * Server-side order lifecycle enforcement. Even if the customer closes the
 * browser, this cron cancels only awaiting_payment after its database deadline:
 * customer expiry for manual rails, expiry + 1 hour for crypto/card providers.
 *
 * Runs entirely through the anon key + clearance-gated RPCs (no service_role):
 *   - list_expired_orders  → the expired unpaid orders (clearance-gated read)
 *   - apply_order_status   → cancels each; also releases the PayPal account slot
 *
 * A verified late payment can still move a cancelled order to pending/processing
 * for human review. This gateway never completes account delivery.
 *
 * PRIMARY expiry cancellation now runs inside Postgres via the pg_cron job
 * `cancel-expired-orders` (public.cron_cancel_expired_orders(), every minute) —
 * no external scheduler needed on the VPS/Coolify deployment. This HTTP endpoint
 * is kept as a manual / backup trigger, protected by CRON_SECRET (Bearer header
 * preferred; x-cron-secret header or ?secret= query fallback).
 */
import { NextRequest, NextResponse } from "next/server";
import { listExpiredOrders, applyOrderStatus } from "@/app/lib/orders.rpc";
import { cfg } from "@/app/lib/runtime-config";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const secret = bearer || req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  const expected = await cfg("CRON_SECRET");
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    checked: 0,
    cancelled: 0,
    cancelledOrders: [] as number[],
    byMethod: {} as Record<string, number>,
    errors: [] as string[],
  };

  try {
    const expiredOrders = await listExpiredOrders();
    results.checked = expiredOrders.length;
    if (expiredOrders.length > 0) {
      console.log(`[Cron] ${expiredOrders.length} expired unpaid order(s) to cancel`);
    }

    for (const row of expiredOrders) {
      const orderNumber = Number(row.order_number);
      const method = String(row.payment_method ?? "unknown");
      try {
        const { result, error } = await applyOrderStatus(orderNumber, "cancelled");
        if (error) {
          results.errors.push(`#${orderNumber}: ${error}`);
          continue;
        }
        if (result?.applied) {
          results.cancelled++;
          results.cancelledOrders.push(orderNumber);
          results.byMethod[method] = (results.byMethod[method] ?? 0) + 1;
          console.log(`[Cron] #${orderNumber} (${method}) → cancelled`);
        }
      } catch (err) {
        console.error(`[Cron] error cancelling #${orderNumber}:`, err);
        results.errors.push(`#${orderNumber}`);
      }
    }

    console.log(`[Cron] RESULTS: ${results.checked} checked, ${results.cancelled} cancelled`);
    if (results.errors.length > 0) console.log(`[Cron] Errors: ${results.errors.join(", ")}`);
    return NextResponse.json(results);
  } catch (err) {
    console.error("[Cron] Fatal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
