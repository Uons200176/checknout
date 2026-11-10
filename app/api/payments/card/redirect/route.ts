import { NextRequest, NextResponse } from "next/server";
import { getOrderPublic, getOrder } from "@/app/lib/orders.rpc";
import { buildPaymentUrl } from "@/app/lib/paygate";

/** The checkout capability is checked on the server on every entry/resume. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("orderId");
  if (!id) return NextResponse.json({ error: "Missing order" }, { status: 400 });
  const visible = await getOrderPublic(id);
  if (!visible || visible.payment_method !== "card-crypto") return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (visible.status !== "awaiting_payment") return NextResponse.json({ error: "This payment session is no longer open." }, { status: 410 });
  const { order, error } = await getOrder(Number(visible.order_number));
  const ref = (order?.payment_reference ?? {}) as Record<string, unknown>;
  if (error || !order || !ref.address_in) return NextResponse.json({ error: "Payment session unavailable" }, { status: 503 });
  const url = buildPaymentUrl({
    addressIn: String(ref.address_in), amount: Number(order.plan_price),
    currency: String(ref.price_currency || "usd"), email: String(order.customer_email),
  });
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
