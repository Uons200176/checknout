/** Receipt delivery is durable and owned by the VPS worker, not request lifetime. */
import { checkoutRpc } from "./checkout-rpc";

export async function sendOrderReceipt(order: Record<string, unknown>, _paymentMethodLabel: string): Promise<void> {
  void _paymentMethodLabel;
  // The transition trigger already enqueues atomically. This also repairs a replay.
  if (!order.order_number) return;
  try {
    const { error } = await checkoutRpc("queue_receipt", { order_number: order.order_number });
    if (error) console.error("Receipt queue request failed; transition outbox remains authoritative.");
  } catch {
    console.error("Receipt queue unavailable; delivery will be retried by the backend.");
  }
}
