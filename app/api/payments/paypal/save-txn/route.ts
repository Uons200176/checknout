/**
 * POST /api/payments/paypal/save-txn
 *
 * Best-effort save of the customer's PayPal transaction id after they say they
 * paid. UUID-keyed, clearance-gated `save_paypal_txn` RPC (anon key, no
 * service_role). Body: { orderId, txnId }.
 */
import { NextRequest, NextResponse } from "next/server";
import { savePaypalTxn } from "@/app/lib/orders.rpc";
import { readJsonCapped } from "@/app/lib/customer-input";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonCapped(req, 1024);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const { orderId, txnId } = body as { orderId?: string; txnId?: string };
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const error = await savePaypalTxn(orderId, txnId);
    if (error) console.error("save-txn RPC error:", error); // best-effort
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("save-txn error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
