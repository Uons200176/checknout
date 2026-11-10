"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface CheckoutOrder {
  status: string;
  orderNumber: number;
  planName: string;
  planPrice: number;
  connections: number;
  customerEmail: string;
  paypalEmail?: string;
  sessionExpiresAt: string;
  serverNow: string;
  redemptionAvailable?: boolean;
  redemption?: {
    state: 'redeeming' | 'verified' | 'review' | 'uncertain' | 'rejected' | 'retryable';
    reason?: string;
    faceValue?: number;
    currency?: string;
    expectedAmount?: number;
    expectedCurrency?: string;
    codeLast4?: string;
  };
}

/** The URL holds only the capability. All instructions come from the server. */
export function useCheckoutOrder(orderId: string, method: "paypal" | "giftcard") {
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [error, setError] = useState("");
  const [displayExpiresAt, setDisplayExpiresAt] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (!orderId) { setError("Invalid order link."); return; }
    try {
      const res = await fetch(`/api/payments/${method}/status?orderId=${encodeURIComponent(orderId)}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!res.ok) throw new Error("Could not verify this order. Please retry.");
      const data: CheckoutOrder = await res.json();
      if (controller.signal.aborted) return;
      const expires = Date.parse(data.sessionExpiresAt);
      const server = Date.parse(data.serverNow);
      if (!Number.isFinite(expires) || !Number.isFinite(server) || !Number.isFinite(Number(data.planPrice))) {
        throw new Error("Payment details are unavailable. Please retry.");
      }
      setOrder(data);
      setDisplayExpiresAt(new Date(Date.now() + expires - server).toISOString());
      setError("");
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load order.");
    }
  }, [orderId, method]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 8000);
    return () => { clearInterval(timer); activeRequest.current?.abort(); };
  }, [refresh]);
  return { order, error, refresh, displayExpiresAt };
}
