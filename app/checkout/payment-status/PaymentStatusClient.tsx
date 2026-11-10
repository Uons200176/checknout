"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useCheckoutRouter as useRouter } from "../../lib/use-checkout-router";
import CheckoutHeader from "../../components/CheckoutHeader";
import CheckoutFooter from "../../components/CheckoutFooter";
import UnifiedStepIndicator from "../../components/UnifiedStepIndicator";

/* ────────────────────────────────────────────────────────────────────── */

interface OrderInfo {
    orderId: string;
    orderNumber: number;
    status: string;
    planName: string;
    planPrice: number;
    connections: number;
    paymentMethod: string;
    createdAt: string;
    sessionExpiresAt?: string | null;
    serverNow?: string;
    sessionExpired?: boolean;
    reconciliationPending?: boolean;
    reconciliationUntil?: string;
    invoiceId?: string | null;
}

interface SupportLinks {
    whatsapp: string;
    telegram: string;
    email: string;
}

interface PaymentStatusClientProps {
    /** Where "Back" should go — resolved server-side from the request's Host header. */
    backHref?: string;
    /** Per-brand support contact links, resolved server-side from site_settings. */
    supportLinks?: SupportLinks;
}

const DEFAULT_SUPPORT_LINKS: SupportLinks = {
    whatsapp: "https://wa.me/message/6CPS42MOC2DHB1",
    telegram: "https://t.me/iptv_support0",
    email: "support@epixiptv.tv",
};

/* ─── Session Countdown Timer ─── */
function SessionTimer({ expiresAt, serverNow }: { expiresAt: string; serverNow?: string }) {
    const [remaining, setRemaining] = useState("");
    const [urgency, setUrgency] = useState<"normal" | "warning" | "critical">("normal");

    useEffect(() => {
        const initialRemaining = Date.parse(expiresAt) - (serverNow ? Date.parse(serverNow) : Date.now());
        const start = performance.now();
        const update = () => {
            const diff = initialRemaining - (performance.now() - start);
            if (diff <= 0) {
                setRemaining("00:00");
                setUrgency("critical");
                return;
            }
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setRemaining(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
            if (diff < 60_000) setUrgency("critical");
            else if (diff < 300_000) setUrgency("warning");
            else setUrgency("normal");
        };
        update();
        const iv = setInterval(update, 1000);
        return () => clearInterval(iv);
    }, [expiresAt, serverNow]);

    const color = urgency === "critical" ? "var(--danger-strong)" : urgency === "warning" ? "var(--warning)" : "var(--accent)";
    const bg = urgency === "critical" ? "rgba(239,68,68,0.1)" : urgency === "warning" ? "rgba(245,158,11,0.1)" : "rgba(201,169,110,0.08)";
    const borderColor = urgency === "critical" ? "rgba(239,68,68,0.25)" : urgency === "warning" ? "rgba(245,158,11,0.25)" : "var(--border)";

    return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", background: bg, borderRadius: "var(--radius-sm)", border: `1px solid ${borderColor}` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Session expires in</span>
            <span style={{ fontSize: "14px", fontWeight: 700, color, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{remaining}</span>
        </div>
    );
}

/* ─── Inline iframe widget ─── */
function InlinePaymentWidget({ invoiceId }: { invoiceId: string }) {
    const [loaded, setLoaded] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const widgetUrl = `https://nowpayments.io/embeds/payment-widget?iid=${invoiceId}`;

    useEffect(() => {
        const t = setTimeout(() => { if (!loaded) setBlocked(true); }, 9000);
        return () => clearTimeout(t);
    }, [loaded]);

    if (blocked) {
        return (
            <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: "16px", padding: "40px 24px", textAlign: "center",
                background: "var(--bg-tertiary)", borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border)", minHeight: "300px",
            }}>
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                </div>
                <div>
                    <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>Widget could not load</p>
                    <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Please use the button below to pay in a new tab.</p>
                </div>
                <a
                    href={widgetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        padding: "12px 28px", borderRadius: "var(--radius-sm)", border: "none",
                        background: "var(--accent)", color: "var(--on-accent)", fontSize: "13px",
                        fontWeight: 600, cursor: "pointer", textDecoration: "none",
                        fontFamily: "var(--font-sans)",
                    }}
                >
                    Open Payment Page →
                </a>
            </div>
        );
    }

    return (
        <div className="ps-iframe-card" style={{ position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--border)", background: "#ffffff", minHeight: "420px", maxWidth: "440px", margin: "0 auto", width: "100%" }}>
            {!loaded && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", background: "#ffffff", zIndex: 1 }}>
                    <div className="ps-spin" style={{ width: "32px", height: "32px", border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%" }} />
                    <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Loading payment widget...</p>
                </div>
            )}
            <iframe
                src={widgetUrl}
                onLoad={() => setLoaded(true)}
                frameBorder="0"
                scrolling="no"
                style={{
                    width: "100%", height: "696px",
                    overflowY: "hidden", border: "none", display: "block"
                }}
                className="ps-iframe-widget"
                title="NOWPayments Payment"
                allow="payment"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
            />
        </div>
    );
}

/* ─── Main Content ─── */
function PaymentStatusContent({ backHref, supportLinks = DEFAULT_SUPPORT_LINKS }: PaymentStatusClientProps) {
    const searchParams = useSearchParams();
    const router = useRouter();

    const rawOrderId = searchParams.get("orderId");
    const urlStatus = searchParams.get("status");

    const urlPaymentMethod = searchParams.get("method") || "";

    const [order, setOrder] = useState<OrderInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [cancelling, setCancelling] = useState(false);
    // PayGate hosted-checkout URL, stashed at redirect time — lets a card-crypto
    // customer who came back before paying resume without restarting checkout.
    const invoiceId = order?.status === "awaiting_payment" ? order.invoiceId || "" : "";
    const resumeUrl = order?.paymentMethod === "card-crypto" && order.status === "awaiting_payment"
        ? `/api/payments/card/redirect?orderId=${encodeURIComponent(order.orderId)}` : null;

    // Always holds the latest resolved payment method so the polling interval —
    // set up once per orderId — can read it without a stale closure.
    const paymentMethodRef = useRef<string>(urlPaymentMethod);
    // `paygate_orderId` is ONLY ever written for a card-crypto order (CheckoutClient),
    // so restoring an id from it also pins the method — else the poll would default to
    // the crypto endpoint and hard-404 on a card order.
    const paygateFallbackRef = useRef<string>("");
    // Keep reading server status after customer expiry so late settlement is visible.
    // Explicit customer cancellation can stop the local poll.
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // For PayGate return flow: pick up orderId from sessionStorage if not in URL.
    const [orderId, setOrderId] = useState<string | null>(rawOrderId);
    useEffect(() => {
        if (!rawOrderId) {
            try {
                const saved = sessionStorage.getItem("paygate_orderId");
                if (saved) {
                    paygateFallbackRef.current = "card-crypto";
                    paymentMethodRef.current = "card-crypto";
                    setOrderId(saved);
                }
            } catch { /* ignore */ }
        }
    }, [rawOrderId]);

    useEffect(() => {
        paymentMethodRef.current = order?.paymentMethod || urlPaymentMethod || paygateFallbackRef.current;
    }, [order?.paymentMethod, urlPaymentMethod]);

    // Fetch + poll order status. Runs once per orderId (the interval must not be
    // torn down and rebuilt on every 8s poll), so the latest payment method is
    // read from paymentMethodRef instead of the effect's captured `order`.
    useEffect(() => {
        if (!orderId) {
            // On the PayGate-return path the id arrives from sessionStorage a tick
            // later; don't flash a "No order ID" error to a paying customer while
            // that recovery is still pending — keep the spinner and let this effect
            // re-run once setOrderId lands. Only error out when there's nothing to recover.
            let recoverable = false;
            try { recoverable = !rawOrderId && !!sessionStorage.getItem("paygate_orderId"); } catch { /* ignore */ }
            if (!recoverable) {
                setError("No order ID provided");
                setLoading(false);
            }
            return;
        }

        let stopped = false;
        let polling = false;

        const statusEndpointFor = (id: string) =>
            paymentMethodRef.current === "card-crypto"
                ? `/api/payments/card/status?orderId=${id}`
                : `/api/payments/crypto/status?orderId=${id}`;

        // Reads are serialized; cancelled session projections can later become paid.
        // Browser polling never controls the independent VPS reconciliation worker.
        const apply = (data: OrderInfo) => {

            setError("");
            setOrder(data);
        };

        const poll = async (isFirst: boolean) => {
            if (polling || stopped) return;
            polling = true;
            try {
                let res = await fetch(statusEndpointFor(orderId));
                // Self-recover from a wrong method guess: if the chosen status
                // endpoint 404s (e.g. a method-less URL defaulted to crypto but the
                // order is card-crypto), try the other endpoint once and pin the
                // correct method so we never deadlock on "Order not found".
                if (res.status === 404) {
                    const otherIsCard = paymentMethodRef.current !== "card-crypto";
                    const alt = await fetch(
                        otherIsCard
                            ? `/api/payments/card/status?orderId=${orderId}`
                            : `/api/payments/crypto/status?orderId=${orderId}`
                    );
                    if (alt.ok) {
                        paymentMethodRef.current = otherIsCard ? "card-crypto" : "crypto";
                        res = alt;
                    }
                }
                if (!res.ok) throw new Error("Not found");
                const data = await res.json();
                if (!stopped) apply(data);
            } catch {
                // Only latch the error screen on the very first load; later transient
                // failures are ignored so a subsequent good poll recovers the UI.
                if (!stopped && isFirst) setError("Order not found");
            } finally {
                polling = false;
                if (!stopped) setLoading(false);
            }
        };

        poll(true);
        intervalRef.current = setInterval(() => { if (!stopped) poll(false); }, 8_000);

        return () => {
            stopped = true;
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        };
    }, [orderId, rawOrderId]);

    // Lifecycle: awaiting_payment / processing → still on the payment step (4).
    // pending → "payment received, under review" (settled step 5, no more action).
    // completed / cancelled → final result (step 5). `completed` is admin-set only.
    const currentStatus = order?.status || (urlStatus === "cancelled" ? "cancelled" : "awaiting_payment");
    const isReview = currentStatus === "pending";
    const isResult = currentStatus === "completed" || currentStatus === "cancelled";
    const settled = isReview || isResult;
    const currentStep = settled ? 5 : 4;

    // Cancel order: call API → update local state → show Step 5 failure
    const handleCancel = async () => {
        if (!orderId || cancelling) return;
        setCancelling(true);
        let ok = false;
        try {
            const res = await fetch("/api/payments/crypto/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId }),
            });
            ok = res.ok;
        } catch { /* network error → treat as not cancelled */ }
        if (ok) {
            // Stop polling and pin the settled screen so an in-flight poll can't revert it.
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            setOrder((prev) => prev ? { ...prev, status: "cancelled" } : prev);
        }
        // If the server REFUSED (e.g. the order is already paid / pending), do NOT fake a
        // cancellation — let the poll keep reflecting the true status (Under Review).
        setCancelling(false);
    };

    // Widen the container for Step 4 when iframe is shown
    const containerMaxWidth = !settled && invoiceId ? "960px" : "600px";

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <CheckoutHeader backHref={backHref} />

            <main style={{ flex: 1, display: "flex", alignItems: !settled && invoiceId ? "flex-start" : "center", justifyContent: "center", padding: "40px 24px" }} className="ps-main">
                <div style={{ maxWidth: containerMaxWidth, width: "100%" }}>
                    {loading ? (
                        <div style={{ textAlign: "center" }}>
                            <div className="ps-spin" style={{ width: "40px", height: "40px", border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", margin: "0 auto 20px" }} />
                            <p style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>Loading order status...</p>
                        </div>
                    ) : error ? (
                        <div style={{ textAlign: "center" }}>
                            <p style={{ color: "var(--error)", marginBottom: "16px" }}>{error}</p>
                            <button onClick={() => router.push("/")} style={{ padding: "10px 24px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px" }}>
                                Return Home
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Step Indicator — unified with checkout */}
                            <div style={{ marginBottom: "32px" }}>
                                <UnifiedStepIndicator
                                    currentStep={currentStep}
                                    finalState={
                                        isResult
                                            ? currentStatus === "completed"
                                                ? "success"
                                                : "failed"
                                            : null
                                    }
                                />
                            </div>

                            {/* ── STEP 4: Awaiting Payment (Inline iframe) ── */}
                            {!settled && (
                                <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }} className="ps-step4-grid">

                                    {/* Left: iframe widget */}
                                    {invoiceId ? (
                                        <div style={{ flex: "1 1 auto", minWidth: 0 }} className="ps-iframe-wrap">
                                            <InlinePaymentWidget invoiceId={invoiceId} />
                                        </div>
                                    ) : (
                                        /* No invoiceId — show pulsing icon only */
                                        <div style={{ flex: "1 1 auto", textAlign: "center" }}>
                                            <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", animation: "psPulse 2s ease-in-out infinite", margin: "0 auto" }}>
                                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10" />
                                                    <polyline points="12 6 12 12 16 14" />
                                                </svg>
                                            </div>
                                        </div>
                                    )}

                                    {/* Right: status info */}
                                    <div style={{ flex: "0 1 280px", display: "flex", flexDirection: "column", gap: "16px", minWidth: "220px" }} className="ps-step4-sidebar">

                                        {/* Title */}
                                        <div>
                                            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
                                                {currentStatus === "processing" ? "Payment Detected" : "Awaiting Payment"}
                                            </h1>
                                            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                                                {currentStatus === "processing"
                                                    ? "We've detected your transaction. Waiting for blockchain confirmations..."
                                                    : order?.paymentMethod === "card-crypto"
                                                        ? "Complete your card payment on PayGate. This page updates automatically when payment is confirmed."
                                                        : "Complete your payment in the widget. This page updates automatically."}
                                            </p>
                                        </div>

                                        {/* Resume PayGate checkout — card-crypto customer who returned before paying */}
                                        {currentStatus === "awaiting_payment" && order?.paymentMethod === "card-crypto" && resumeUrl && (
                                            <a href={resumeUrl} style={{
                                                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                                                width: "100%", padding: "12px", borderRadius: "var(--radius-sm)", border: "none",
                                                background: "var(--accent)", color: "var(--on-accent)", fontSize: "13px", fontWeight: 600,
                                                textDecoration: "none", fontFamily: "var(--font-sans)",
                                            }}>
                                                Resume payment on PayGate →
                                            </a>
                                        )}

                                        {/* Session Timer */}
                                        {order?.sessionExpiresAt && !settled && (
                                            <SessionTimer expiresAt={order.sessionExpiresAt} serverNow={order.serverNow} />
                                        )}

                                        {/* Polling badge */}
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--text-muted)", padding: "8px 12px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                                            <span className="ps-spin" style={{ width: "10px", height: "10px", border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                                            Auto-refreshing every 8s
                                        </div>

                                        {/* Order mini-card */}
                                        {order && (
                                            <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Order</span>
                                                    <span style={{ fontSize: "11px", color: "var(--text-primary)", fontWeight: 600 }}>#{order.orderNumber}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Plan</span>
                                                    <span style={{ fontSize: "11px", color: "var(--text-primary)" }}>{order.planName}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Devices</span>
                                                    <span style={{ fontSize: "11px", color: "var(--text-primary)" }}>{order.connections}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
                                                    <span style={{ fontSize: "12px", fontWeight: 600 }}>Total</span>
                                                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent)" }}>${order.planPrice.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Cancel — ONLY for a still-unpaid order. Once the payment is
                                            detected ('processing') or received ('pending'), the order is no
                                            longer customer-cancellable, so a paid order can't be dropped. */}
                                        {currentStatus === "awaiting_payment" && (
                                            <button
                                                onClick={handleCancel}
                                                disabled={cancelling}
                                                style={{
                                                    width: "100%", padding: "11px", borderRadius: "var(--radius-sm)",
                                                    border: "1px solid var(--border)", background: "transparent",
                                                    color: "var(--text-muted)",
                                                    fontSize: "12px", fontWeight: 500,
                                                    cursor: cancelling ? "not-allowed" : "pointer",
                                                    fontFamily: "var(--font-sans)", transition: "all var(--transition)",
                                                    opacity: cancelling ? 0.6 : 1,
                                                }}
                                                onMouseEnter={(e) => { if (!cancelling) { e.currentTarget.style.borderColor = "var(--error)"; e.currentTarget.style.color = "var(--error)"; } }}
                                                onMouseLeave={(e) => { if (!cancelling) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; } }}
                                            >
                                                {cancelling ? "Cancelling..." : "Cancel Order"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── STEP 5: Payment received — under review (pending) ── */}
                            {isReview && (
                                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "28px" }}>
                                    <div style={{ width: "100px", height: "100px", borderRadius: "50%", background: "linear-gradient(135deg, rgba(201,169,110,0.18), rgba(201,169,110,0.06))", display: "flex", alignItems: "center", justifyContent: "center", animation: "psScaleIn 500ms ease" }}>
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" /><polyline points="12 7 12 12 15 14" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h1 style={{ fontSize: "26px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px" }}>
                                            Payment Received — Under Review
                                        </h1>
                                        <p style={{ fontSize: "14px", color: "var(--text-tertiary)", lineHeight: 1.6, maxWidth: "440px" }}>
                                            We&apos;ve received your payment and our team is verifying it now. Your account
                                            details will be sent to your <strong style={{ color: "var(--text-secondary)" }}>email or WhatsApp</strong> shortly.
                                        </p>
                                    </div>

                                    {order && (
                                        <div style={{ width: "100%", maxWidth: "440px", background: "var(--bg-secondary)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-lg)", padding: "28px", textAlign: "left" }}>
                                            <h3 style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "20px" }}>Order Receipt</h3>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Order Number</span>
                                                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>#{order.orderNumber}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Plan</span>
                                                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{order.planName}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Connections</span>
                                                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{order.connections} {order.connections === 1 ? "Device" : "Devices"}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Status</span>
                                                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, background: "rgba(201,169,110,0.12)", color: "var(--accent)" }}>
                                                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)" }} />
                                                        Under Review
                                                    </span>
                                                </div>
                                                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", marginTop: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <span style={{ fontSize: "15px", fontWeight: 600 }}>Total</span>
                                                    <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--accent)" }}>${order.planPrice.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ width: "100%", maxWidth: "440px", background: "rgba(201,169,110,0.06)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-lg)", padding: "20px 24px", textAlign: "center" }}>
                                        <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
                                            Verification usually takes <strong style={{ color: "var(--text-primary)" }}>10 minutes to 4 hours</strong>. Please check your <strong style={{ color: "var(--text-secondary)" }}>spam/junk</strong> folder too, or contact us below.
                                        </p>
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "440px" }}>
                                        <div style={{ display: "flex", gap: "10px" }}>
                                            <a href={supportLinks.whatsapp} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "14px", borderRadius: "var(--radius-sm)", border: "none", background: "var(--whatsapp-button)", color: "#fff", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>WhatsApp</a>
                                            <a href={supportLinks.telegram} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "14px", borderRadius: "var(--radius-sm)", border: "none", background: "var(--telegram-button)", color: "#fff", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Telegram</a>
                                        </div>
                                        <button onClick={() => router.push("/")} style={{ width: "100%", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}>Return to Home</button>
                                    </div>
                                </div>
                            )}

                            {/* ── STEP 5: Final Result ── */}
                            {isResult && (
                                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "28px" }}>
                                    {/* Success / Failure Icon */}
                                    {currentStatus === "completed" ? (
                                        <div style={{ position: "relative" }}>
                                            <div style={{ width: "100px", height: "100px", borderRadius: "50%", background: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(34,197,94,0.08))", display: "flex", alignItems: "center", justifyContent: "center", animation: "psScaleIn 500ms ease" }}>
                                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                                    <polyline points="22 4 12 14.01 9 11.01" />
                                                </svg>
                                            </div>
                                            <div style={{ position: "absolute", top: "-4px", right: "-4px", width: "16px", height: "16px", borderRadius: "50%", background: "var(--success)", animation: "psSpark 1.5s ease infinite" }} />
                                            <div style={{ position: "absolute", bottom: "0", left: "-8px", width: "10px", height: "10px", borderRadius: "50%", background: "#34d399", animation: "psSpark 1.5s ease 0.3s infinite" }} />
                                        </div>
                                    ) : (
                                        <div style={{ width: "100px", height: "100px", borderRadius: "50%", background: "rgba(248,113,113,0.12)", display: "flex", alignItems: "center", justifyContent: "center", animation: "psScaleIn 500ms ease" }}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                                            </svg>
                                        </div>
                                    )}

                                    {/* Title */}
                                    <div>
                                        <h1 style={{ fontSize: "26px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px" }}>
                                            {currentStatus === "completed" ? "Payment Successful!" : order?.sessionExpired ? "Payment Session Expired" : "Payment Failed"}
                                        </h1>
                                        <p style={{ fontSize: "14px", color: "var(--text-tertiary)", lineHeight: 1.6, maxWidth: "420px" }}>
                                            {currentStatus === "completed"
                                                ? order?.paymentMethod === "card-crypto"
                                                    ? "Your card payment has been confirmed. Thank you for your order!"
                                                    : "Your cryptocurrency payment has been confirmed. Thank you for your order!"
                                                : order?.reconciliationPending
                                                  ? "Your payment session has ended. We continue checking for an existing payment for one additional hour. If you have already paid, do not pay again; this page updates automatically."
                                                  : "This session is closed. If you already sent a payment, contact support before trying again."}
                                        </p>
                                    </div>

                                    {/* Order details card */}
                                    {order && (
                                        <div style={{
                                            width: "100%", maxWidth: "440px",
                                            background: "var(--bg-secondary)",
                                            border: `1px solid ${currentStatus === "completed" ? "rgba(74,222,128,0.2)" : "var(--border)"}`,
                                            borderRadius: "var(--radius-lg)", padding: "28px", textAlign: "left",
                                        }}>
                                            <h3 style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "20px" }}>
                                                Order Summary
                                            </h3>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Order Number</span>
                                                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600, fontFamily: "var(--font-mono, monospace)" }}>#{order.orderNumber}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Plan</span>
                                                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{order.planName}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Connections</span>
                                                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{order.connections} {order.connections === 1 ? "Device" : "Devices"}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Payment</span>
                                                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
                                                        {order.paymentMethod === "card-crypto" ? (
                                                            <>
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                                                                Card Payment
                                                            </>
                                                        ) : (
                                                            <>
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.5 8h5l-1.5 3h2l-4 5 1-3H9.5l1.5-5z" /></svg>
                                                                Cryptocurrency
                                                            </>
                                                        )}
                                                    </span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Status</span>
                                                    <span style={{
                                                        display: "inline-flex", alignItems: "center", gap: "6px",
                                                        padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: 600,
                                                        background: currentStatus === "completed" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                                                        color: currentStatus === "completed" ? "var(--success)" : "var(--error)",
                                                    }}>
                                                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: currentStatus === "completed" ? "var(--success)" : "var(--error)" }} />
                                                        {currentStatus === "completed" ? "Confirmed" : "Failed"}
                                                    </span>
                                                </div>
                                                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", marginTop: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <span style={{ fontSize: "15px", fontWeight: 600 }}>Total Paid</span>
                                                    <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--accent)" }}>${order.planPrice.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Delivery message + spam notice (success only) */}
                                    {currentStatus === "completed" && (
                                        <div style={{
                                            width: "100%", maxWidth: "440px",
                                            background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
                                            borderRadius: "var(--radius-lg)", padding: "20px 24px", textAlign: "center",
                                            display: "flex", flexDirection: "column", gap: "12px",
                                        }}>
                                            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
                                                Your account details will be sent to your email within{" "}
                                                <strong style={{ color: "var(--text-primary)" }}>10 minutes to 4 hours</strong>{" "}
                                                after our team reviews your payment.
                                            </p>
                                            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.6, margin: 0 }}>
                                                📧 Didn&apos;t receive the email? Please check your{" "}
                                                <strong style={{ color: "var(--text-secondary)" }}>spam/junk folder</strong>.
                                                If you still haven&apos;t received it, contact us below.
                                            </p>
                                        </div>
                                    )}

                                    {/* Contact buttons (success) */}
                                    {currentStatus === "completed" && (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "440px" }}>
                                            {/* Row 1: WhatsApp + Telegram */}
                                            <div style={{ display: "flex", gap: "10px" }}>
                                                <a href={supportLinks.whatsapp} target="_blank" rel="noopener noreferrer" style={{
                                                    flex: 1, padding: "14px", borderRadius: "var(--radius-sm)",
                                                    border: "none", background: "var(--whatsapp-button)", color: "#fff",
                                                    fontSize: "13px", fontWeight: 600,
                                                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                                                    textDecoration: "none",
                                                }}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                                    </svg>
                                                    WhatsApp
                                                </a>
                                                <a href={supportLinks.telegram} target="_blank" rel="noopener noreferrer" style={{
                                                    flex: 1, padding: "14px", borderRadius: "var(--radius-sm)",
                                                    border: "none", background: "var(--telegram-button)", color: "#fff",
                                                    fontSize: "13px", fontWeight: 600,
                                                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                                                    textDecoration: "none",
                                                }}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                                                    </svg>
                                                    Telegram
                                                </a>
                                            </div>
                                            {/* Row 2: Email */}
                                            <a href={`mailto:${supportLinks.email}`} style={{
                                                width: "100%", padding: "14px", borderRadius: "var(--radius-sm)",
                                                border: "1px solid var(--border)", background: "var(--bg-secondary)",
                                                color: "var(--text-primary)", fontSize: "13px", fontWeight: 500,
                                                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                                                textDecoration: "none", boxSizing: "border-box",
                                            }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                                    <polyline points="22,6 12,13 2,6" />
                                                </svg>
                                                {supportLinks.email}
                                            </a>
                                        </div>
                                    )}

                                    {/* Failure actions */}
                                    {currentStatus === "cancelled" && !order?.reconciliationPending && (
                                        <div style={{ display: "flex", gap: "12px", width: "100%", maxWidth: "440px" }}>
                                            <button
                                                onClick={() => {
                                                    try {
                                                        const saved = sessionStorage.getItem("checkout_form");
                                                        const d = saved ? JSON.parse(saved) : {};
                                                        const params = new URLSearchParams({ retry: "1" });
                                                        if (d.planId) params.set("plan", d.planId);
                                                        if (d.connections) params.set("connections", String(d.connections));
                                                        // keep the customer's checkout language on retry
                                                        const lang = new URLSearchParams(window.location.search).get("lang");
                                                        if (lang) params.set("lang", lang);
                                                        router.push(`/checkout?${params.toString()}`);
                                                    } catch {
                                                        router.push("/checkout?retry=1");
                                                    }
                                                }}
                                                style={{ flex: 1, padding: "14px", borderRadius: "var(--radius-sm)", border: "none", background: "var(--accent)", color: "var(--on-accent)", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all var(--transition)" }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"}
                                                onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}
                                            >
                                                Try Again
                                            </button>
                                            <button
                                                onClick={() => router.push("/")}
                                                style={{ flex: 1, padding: "14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all var(--transition)" }}
                                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                                            >
                                                Return Home
                                            </button>
                                        </div>
                                    )}

                                    {/* Done (success) */}
                                    {currentStatus === "completed" && (
                                        <button onClick={() => router.push("/")} style={{ padding: "10px 24px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: "12px", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                                            Return to Home
                                        </button>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

            <CheckoutFooter />

            <style>{`
                @keyframes psSpin { to { transform: rotate(360deg); } }
                .ps-spin { animation: psSpin 1s linear infinite; }
                @keyframes psPulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.05); opacity: 0.85; }
                }
                @keyframes psScaleIn {
                    from { transform: scale(0.6); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                @keyframes psSpark {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(0.3); opacity: 0; }
                }
                /* Step 4 layout: side-by-side on wide, stacked on mobile */
                .ps-step4-grid { flex-direction: row; }
                .ps-step4-sidebar { min-width: 220px; }
                @media (max-width: 720px) {
                    .ps-step4-grid {
                        flex-direction: column !important;
                        gap: 20px !important;
                    }
                    .ps-step4-sidebar {
                        flex: 1 1 auto !important;
                        min-width: 0 !important;
                        width: 100% !important;
                        order: -1;
                    }
                    .ps-iframe-wrap {
                        width: 100% !important;
                        flex: 1 1 auto !important;
                    }
                    .ps-iframe-card {
                        max-width: 100% !important;
                    }
                    .ps-iframe-widget {
                        max-width: 100% !important;
                        width: 100% !important;
                    }
                }
                @media (max-width: 480px) {
                    .ps-main { padding: 20px 12px !important; }
                    .ps-iframe-widget {
                        height: 580px !important;
                    }
                }
                @media (max-width: 360px) {
                    .ps-main { padding: 16px 8px !important; }
                    .ps-iframe-widget {
                        height: 520px !important;
                    }
                }
            `}</style>
        </div>
    );
}

export default function PaymentStatusClient({ backHref, supportLinks }: PaymentStatusClientProps) {
    return (
        <Suspense
            fallback={
                <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <p style={{ color: "var(--text-tertiary)" }}>Loading...</p>
                </div>
            }
        >
            <PaymentStatusContent backHref={backHref} supportLinks={supportLinks} />
        </Suspense>
    );
}
