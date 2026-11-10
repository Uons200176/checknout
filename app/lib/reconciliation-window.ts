/** Provider checks may continue for one hour without extending the customer capability. */
export function isReconciliationOpen(order: Record<string, unknown>, now = Date.now()): boolean {
  if (!["crypto", "card-crypto"].includes(String(order.payment_method))) return false;
  if (!["awaiting_payment", "processing", "cancelled"].includes(String(order.status))) return false;
  const expiry = Date.parse(String(order.session_expires_at ?? ""));
  return Number.isFinite(expiry) && now < expiry + 60 * 60 * 1000;
}
