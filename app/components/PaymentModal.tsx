"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface PaymentModalProps {
    /** The NOWPayments invoice ID (used to build the widget URL) */
    invoiceId: string;
    /** The full invoice URL (fallback if iframe blocked) */
    invoiceUrl: string;
    /** Our internal order ID (for polling status) */
    orderId: string;
    /** Called when user closes the modal */
    onClose: () => void;
    /** Called when payment is confirmed (status polling detected completed) */
    onCompleted?: () => void;
}

export default function PaymentModal({
    invoiceId,
    invoiceUrl,
    orderId,
    onClose,
    onCompleted,
}: PaymentModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [iframeBlocked, setIframeBlocked] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);

    const widgetUrl = `https://nowpayments.io/payment/?iid=${invoiceId}&paymentId=`;

    // — Detect iframe load failure ——————————————————————————————————
    const handleIframeLoad = useCallback(() => {
        setIframeLoaded(true);
    }, []);

    const handleIframeError = useCallback(() => {
        setIframeBlocked(true);
    }, []);

    // Extra detection: if iframe hasn't loaded in 8s, assume blocked
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (!iframeLoaded) {
                setIframeBlocked(true);
            }
        }, 8000);
        return () => clearTimeout(timeout);
    }, [iframeLoaded]);

    // — Poll order status every 8 seconds ——————————————————————————
    useEffect(() => {
        const poll = async () => {
            try {
                const res = await fetch(`/api/payments/crypto/status?orderId=${orderId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === "completed") {
                        onCompleted?.();
                    }
                }
            } catch { /* ignore */ }
        };

        pollingRef.current = setInterval(poll, 8000);
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [orderId, onCompleted]);

    // Close on overlay click
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) onClose();
    };

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onClose]);

    // — If iframe is blocked, redirect to external page ————————————
    const handleOpenExternal = () => {
        // Navigate to status page first (so they can track after paying)
        onClose();
        window.open(invoiceUrl || widgetUrl, "_blank", "noopener,noreferrer");
    };

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                background: "var(--overlay)",
                backdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                animation: "pmFadeIn 200ms ease",
            }}
        >
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: "500px",
                    maxHeight: "90vh",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--modal-shadow)",
                    display: "flex",
                    flexDirection: "column",
                    animation: "pmSlideUp 250ms ease",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "16px 20px",
                        borderBottom: "1px solid var(--border)",
                        background: "var(--bg-tertiary)",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.5 8h5l-1.5 3h2l-4 5 1-3H9.5l1.5-5z" />
                        </svg>
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                            Cryptocurrency Payment
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: "32px", height: "32px", borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)", background: "transparent",
                            color: "var(--text-tertiary)", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all var(--transition)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                {iframeBlocked ? (
                    /* ── Fallback: iframe blocked ─────────────────── */
                    <div style={{ padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
                        <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </div>
                        <div>
                            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                                Payment Widget Unavailable
                            </h3>
                            <p style={{ fontSize: "13px", color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                                The embedded payment widget could not be loaded. Click below to open the payment page in a new tab.
                            </p>
                        </div>
                        <button
                            onClick={handleOpenExternal}
                            style={{
                                padding: "14px 32px", borderRadius: "var(--radius-sm)",
                                border: "none", background: "var(--accent)", color: "var(--on-accent)",
                                fontSize: "14px", fontWeight: 600, cursor: "pointer",
                                fontFamily: "var(--font-sans)", transition: "all var(--transition)",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}
                        >
                            Open Payment Page →
                        </button>
                    </div>
                ) : (
                    /* ── Normal: iframe ─────────────────────────── */
                    <div style={{ flex: 1, minHeight: "520px", position: "relative" }}>
                        {!iframeLoaded && (
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-secondary)" }}>
                                <div style={{ textAlign: "center" }}>
                                    <div className="pm-spin" style={{ width: "32px", height: "32px", border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", margin: "0 auto 12px" }} />
                                    <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Loading payment widget...</p>
                                </div>
                            </div>
                        )}
                        <iframe
                            src={widgetUrl}
                            onLoad={handleIframeLoad}
                            onError={handleIframeError}
                            width="410"
                            height="696"
                            frameBorder="0"
                            scrolling="no"
                            style={{
                                width: "100%", maxWidth: "410px", height: "696px",
                                overflowY: "hidden", border: "none", background: "#ffffff",
                                display: "block", margin: "0 auto"
                            }}
                            title="NOWPayments Payment"
                            allow="payment"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
                        />
                    </div>
                )}

                {/* Footer */}
                <div
                    style={{
                        padding: "12px 20px", borderTop: "1px solid var(--border)",
                        background: "var(--bg-tertiary)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Secured by NOWPayments</span>
                    </div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-muted)" }}>
                        <span className="pm-spin" style={{ width: "10px", height: "10px", border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block" }} />
                        Monitoring payment...
                    </span>
                </div>
            </div>

            <style>{`
        @keyframes pmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pmSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pmSpin { to { transform: rotate(360deg); } }
        .pm-spin { animation: pmSpin 1s linear infinite; }
      `}</style>
        </div>
    );
}
