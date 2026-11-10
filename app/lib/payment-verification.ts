/** Provider identity is checked as well as its authenticated transport. */
export function verifyNowPayment(order: Record<string, unknown>, payment: Record<string, unknown>): boolean {
  const ref = (order.payment_reference ?? {}) as Record<string, unknown>;
  const amount = Number(payment.price_amount);
  const expected = Number(order.plan_price);
  return order.payment_method === "crypto"
    && !!ref.invoice_id && String(payment.invoice_id) === String(ref.invoice_id)
    && String(payment.order_id) === String(order.order_number)
    && Number.isFinite(amount) && Number.isFinite(expected) && expected > 0
    && Math.abs(amount - expected) < 0.005
    && String(payment.price_currency).toLowerCase() === String(ref.price_currency ?? "usd").toLowerCase()
    && /^\d+$/.test(String(payment.payment_id));
}

/** USDC proceeds cannot be compared directly with a non-USD price. */
export function paygateReviewStatus(order: Record<string, unknown>, value: unknown): "pending" | "processing" {
  const ref = (order.payment_reference ?? {}) as Record<string, unknown>;
  const received = Number(value), expected = Number(order.plan_price);
  return String(ref.price_currency ?? "usd").toLowerCase() === "usd"
    && Number.isFinite(received) && received > 0 && Number.isFinite(expected) && expected > 0
    && Math.abs(received - expected) / expected <= 0.08 ? "pending" : "processing";
}
