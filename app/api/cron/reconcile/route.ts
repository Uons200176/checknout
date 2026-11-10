import { NextRequest, NextResponse } from "next/server";
import { isReconciliationOpen } from "@/app/lib/reconciliation-window";
import { timingSafeEqual } from "node:crypto";
import { cfg } from "@/app/lib/runtime-config";
import { checkoutRpc } from "@/app/lib/checkout-rpc";
import { getOrder, applyOrderStatus, updateOrderReference } from "@/app/lib/orders.rpc";
import { getPaymentStatus, mapPaymentStatus } from "@/app/lib/nowpayments";
import { checkPaygateStatus } from "@/app/lib/paygate";
import { verifyNowPayment, paygateReviewStatus } from "@/app/lib/payment-verification";

/** Called by the VPS, independently of customer browsers. Never accepts customer parameters. */
export async function POST(req: NextRequest) {
  const expected = await cfg("CRON_SECRET");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!expected || expected.length !== given.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await checkoutRpc("reconciliation_orders");
  if (error) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  let checked = 0, deferred = 0, failed = 0;
  const rows = (data ?? []) as { order_number: number }[];
  // Small bounded batches keep provider calls inside the server request budget.
  for (let i = 0; i < rows.length; i += 4) {
    await Promise.all(rows.slice(i, i + 4).map(async ({ order_number }) => {
      let problem: string | null = null;
      try {
        const { order, error: readError } = await getOrder(order_number);
        if (readError || !order) throw new Error("Order unavailable");
        if (!isReconciliationOpen(order)) return;
        const ref = (order.payment_reference ?? {}) as Record<string, unknown>;
        let status: string | null = null;
        let detail: Record<string, unknown> = {};
        if (order.payment_method === "card-crypto" && ref.ipn_token) {
          const result = await checkPaygateStatus(String(ref.ipn_token));
          if (result.status === "paid") {
            status = paygateReviewStatus(order, result.value_coin);
            detail = { value_coin: result.value_coin, txid_in: result.txid_in, txid_out: result.txid_out };
          }
        } else if (order.payment_method === "crypto" && ref.payment_id) {
          const result = await getPaymentStatus(String(ref.payment_id));
          if (!verifyNowPayment(order, result)) throw new Error("Provider reference mismatch");
          status = mapPaymentStatus(String(result.payment_status));
          detail = { payment_status: result.payment_status, actually_paid: result.actually_paid };
        } else {
          deferred++;
          problem = "Provider reference unavailable; awaiting authenticated webhook or operator review";
        }
        if (status) {
          const changed = await applyOrderStatus(order_number, status, { paymentReference: detail });
          if (changed.error) throw new Error("Status persistence failed");
        }
        checked++;
      } catch {
        failed++;
        problem = "Provider verification unavailable; retry scheduled";
      }
      if (await updateOrderReference(order_number, { last_checked_at: new Date().toISOString(), reconciliation_error: problem })) failed++;
    }));
  }
  return NextResponse.json({ checked, deferred, failed }, { status: failed ? 503 : 200 });
}
