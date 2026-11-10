"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useCheckoutRouter as useRouter } from "../../lib/use-checkout-router";
import { useCheckoutOrder } from "../../lib/use-checkout-order";
import CheckoutHeader from "../../components/CheckoutHeader";
import CheckoutFooter from "../../components/CheckoutFooter";
import UnifiedStepIndicator from "../../components/UnifiedStepIndicator";

interface SupportLinksData {
    whatsapp: string;
    telegram: string;
    email: string;
}

interface PaypalPendingClientProps {
    /** Where "Back" should go — resolved server-side from the request's Host header. */
    backHref?: string;
    /** Per-brand support contact links, resolved server-side from site_settings. */
    supportLinks?: SupportLinksData;
}

const DEFAULT_SUPPORT_LINKS: SupportLinksData = {
    whatsapp: "https://wa.me/message/6CPS42MOC2DHB1",
    telegram: "https://t.me/iptv_support0",
    email: "support@epixiptv.tv",
};

/**
 * Page chrome (header + step indicator + footer) wrapping each phase's content.
 * Declared at module scope — NOT inside the render — so React keeps the same
 * component instance across re-renders and doesn't remount the subtree (which
 * would drop input focus and reset the transaction-ID field on every tick).
 */
function PageShell({
    step,
    backHref,
    children,
}: {
    step: number;
    backHref?: string;
    children: React.ReactNode;
}) {
    return (
        <div style={S.page}>
            <CheckoutHeader backHref={backHref} />
            {/* Step indicator */}
            <div style={S.stepWrap}>
                <UnifiedStepIndicator currentStep={step} />
            </div>
            <main style={S.main}>{children}</main>
            <CheckoutFooter />
        </div>
    );
}

/* ─── Amount rounding: 14.99 → 15, 12.00 → 12, 12.50 → 12.50 ─── */
function formatPaypalAmount(price: number): string {
    return price.toFixed(2).replace(/\.00$/, "");
}

/* ─── Copy button ─── */
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={async () => {
                try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
            }}
            style={S.copyBtn}
            title="Copy"
        >
            {copied
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            }
        </button>
    );
}

/* ─── Countdown timer ─── */
function useCountdown(expiresAt: string) {
    const calcRemaining = useCallback(() => {
        const ms = new Date(expiresAt).getTime() - Date.now();
        return Math.max(0, Math.floor(ms / 1000));
    }, [expiresAt]);

    const [remaining, setRemaining] = useState(calcRemaining);

    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => setRemaining(calcRemaining());
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt, calcRemaining]);

    const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
    const secs = String(remaining % 60).padStart(2, "0");
    return { remaining, display: `${mins}:${secs}`, expired: remaining === 0 };
}

/* ─── Transaction ID Modal ─── */
function TxnModal({ onConfirm, onClose, isSaving, error }: { onConfirm: (id: string) => void; onClose: () => void; isSaving: boolean; error: string }) {
    const [txnId, setTxnId] = useState("");

    // Prevent closing if currently saving
    const handleClose = () => {
        if (!isSaving) onClose();
    };

    return (
        <div style={S.overlay} onClick={handleClose}>
            <div style={S.modal} onClick={e => e.stopPropagation()}>
                <h3 style={S.modalTitle}>Transaction ID (Optional)</h3>
                <p style={S.modalHint}>
                    Find it in your PayPal confirmation email, or go to{" "}
                    <strong>PayPal → Activity → Transaction Details</strong> and copy the ID.
                </p>
                <input
                    type="text"
                    placeholder="e.g. 7XA123456B987654C"
                    value={txnId}
                    onChange={e => setTxnId(e.target.value)}
                    style={S.modalInput}
                    disabled={isSaving}
                    autoFocus
                />
                {error && <p style={{ color: "var(--error)", fontSize: "0.82rem", margin: 0 }}>{error}</p>}

                <div style={S.modalActions}>
                    <button style={S.modalSkip} onClick={() => onConfirm("")} disabled={isSaving}>
                        Skip
                    </button>
                    <button
                        style={{...S.modalConfirm, opacity: isSaving ? 0.7 : 1, cursor: isSaving ? "not-allowed" : "pointer"}}
                        onClick={() => onConfirm(txnId.trim())}
                        disabled={isSaving}
                    >
                        {isSaving ? "Saving..." : "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Isolated Timer Component ─── */
function SessionTimerBanner({ expiresAt, onExpire }: { expiresAt: string, onExpire: () => void }) {
    const { remaining, display: timerDisplay, expired } = useCountdown(expiresAt);
    const hasAutoExpired = useRef(false);

    useEffect(() => {
        if (expired && !hasAutoExpired.current) {
            hasAutoExpired.current = true;
            onExpire();
        }
    }, [expired, onExpire]);

    if (!expiresAt) return null;

    const timerUrgent = remaining < 120; // <2 min → red
    const timerMid = remaining < 300; // <5 min → amber

    return (
        <div style={{
            ...S.timerBox,
            borderColor: timerUrgent ? "rgba(248,113,113,0.4)" : timerMid ? "rgba(245,158,11,0.4)" : "var(--border)",
            background: timerUrgent ? "rgba(248,113,113,0.06)" : timerMid ? "rgba(245,158,11,0.06)" : "var(--bg-elevated)",
        }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={timerUrgent ? "var(--error)" : timerMid ? "var(--warning)" : "var(--text-tertiary)"} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
            <span style={{ color: timerUrgent ? "var(--error)" : timerMid ? "var(--warning)" : "var(--text-secondary)", fontSize: "0.85rem" }}>
                Session expires in{" "}
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{timerDisplay}</strong>
                {timerUrgent && " — complete your payment now!"}
            </span>
        </div>
    );
}

/* ─── Main Content ─── */
function PaypalPendingContent({ backHref, supportLinks = DEFAULT_SUPPORT_LINKS }: PaypalPendingClientProps) {
    const searchParams = useSearchParams();
    const router = useRouter();

    const orderId = searchParams.get("orderId") || "";
    const { order, error: orderError, refresh, displayExpiresAt: expiresAt } = useCheckoutOrder(orderId, "paypal");
    const orderNumber = String(order?.orderNumber ?? "");
    const planName = order?.planName ?? "";
    const planPrice = Number(order?.planPrice ?? 0);
    const connections = String(order?.connections ?? "");
    const customerEmail = order?.customerEmail ?? "";
    const paypalEmail = order?.paypalEmail ?? "";

    const amountStr = formatPaypalAmount(planPrice);

    // "instructions" | "awaiting_txn" | "review" | "expired"
    const [localPhase, setPhase] = useState<"instructions" | "awaiting_txn" | "review" | "expired">("instructions");
    const [txnId, setTxnId] = useState("");

    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState("");

    const [savingTxn, setSavingTxn] = useState(false);
    const [txnError, setTxnError] = useState("");

    const phase = order?.status === "cancelled" ? "expired"
        : order && ["pending", "completed", "processing"].includes(order.status) ? "review" : localPhase;

    // Countdown only prompts a server refresh; it cannot cancel or confirm orders.
    const handleExpire = useCallback(() => { void refresh(); }, [refresh]);

    const handleSentPayment = () => {
        // Just open the TxnModal — do NOT call confirm API yet
        setPhase("awaiting_txn");
    };

    const handleTxnConfirm = async (id: string) => {
        setTxnId(id);
        setTxnError("");

        if (!orderId) {
            setTxnError("Invalid order link.");
            return;
        }

        setSavingTxn(true);
        try {
            // Call confirm with optional txnId (null if skipped)
            const res = await fetch("/api/payments/paypal/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, txnId: id || null }),
            });

            if (!res.ok) {
                setTxnError("Failed to confirm order. Please try again.");
                setSavingTxn(false);
                return;
            }
        } catch {
            setTxnError("Network error. Please check your connection and try again.");
            setSavingTxn(false);
            return;
        }

        setSavingTxn(false);
        setPhase("review");
    };

    const handleCancel = useCallback(async () => {
        if (!orderId) return;
        setCancelling(true);
        setCancelError("");
        try {
            const res = await fetch("/api/payments/paypal/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId }),
            });
            if (res.ok) {
                await refresh();
            } else {
                const d = await res.json();
                setCancelError(d.error || "Failed to cancel");
                setCancelling(false);
            }
        } catch {
            setCancelError("An error occurred");
            setCancelling(false);
        }
    }, [orderId, refresh]);



    if (!order || orderError) {
        return <PageShell step={3} backHref={backHref}>
            <p role={orderError ? "alert" : "status"}>{orderError || "Loading secure payment details…"}</p>
            {orderError && <button style={S.btnPrimary} onClick={() => void refresh()}>Retry</button>}
        </PageShell>;
    }

    // ── Invalid link guard ──
    if (!orderId) {
        return (
            <div style={S.errWrap}>
                <p style={{ color: "var(--error)", marginBottom: "1rem" }}>Invalid or expired order link.</p>
                <button style={S.btnPrimary} onClick={() => router.push("/")}>Go Home</button>
            </div>
        );
    }

    // ─── Phase: Expired / Timeout ───
    if (phase === "expired") {
        return (
            <PageShell step={5} backHref={backHref}>
                <div style={S.card}>
                    <div style={S.cardHeader}>
                        <div style={{ ...S.badge, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--error)" }}>
                            ⏱ Session Expired
                        </div>
                        <h1 style={S.title}>Payment Time Expired</h1>
                        <p style={S.subtitle}>
                            Your 30-minute payment window has expired and the order has been automatically cancelled.
                            Please try again.
                        </p>
                    </div>
                    <button style={S.btnPrimary} onClick={() => router.push("/checkout?step=3")}>
                        ↩ Try Again
                    </button>
                    <button style={S.btnOutline} onClick={() => router.push("/")}>Return to Homepage</button>
                    <SupportLinks links={supportLinks} />
                </div>
            </PageShell>
        );
    }

    // ─── Phase: Instructions ───
    if (phase === "instructions") {
        return (
            <PageShell step={4} backHref={backHref}>
                {/* TxnModal rendered on top when awaiting */}
                <div style={S.card}>
                    {/* Header */}
                    <div style={S.cardHeader}>
                        <div style={{ ...S.badge, background: "rgba(0,156,222,0.1)", border: "1px solid rgba(0,156,222,0.3)", color: "var(--paypal-text)" }}>
                            <span>PayPal – Friends &amp; Family</span>
                        </div>
                        <h1 style={S.title}>Complete Your Payment</h1>
                        <p style={S.subtitle}>
                            Follow the steps below carefully to ensure your order is processed quickly.
                        </p>
                    </div>

                    {/* Session timer */}
                    <SessionTimerBanner expiresAt={expiresAt} onExpire={handleExpire} />

                    {/* Two-column info grid: PayPal email + Amount */}
                    <div style={S.infoGrid}>
                        <div style={S.infoBlock}>
                            <span style={S.infoLabel}>Send payment to</span>
                            <div style={S.infoRow}>
                                <span style={S.infoVal}>{paypalEmail}</span>
                                <CopyButton text={paypalEmail} />
                            </div>
                        </div>
                        <div style={S.infoBlock}>
                            <span style={S.infoLabel}>Amount to send</span>
                            <div style={S.infoRow}>
                                <span style={{ ...S.infoVal, color: "var(--accent)", fontSize: "1.25rem", fontWeight: 700 }}>
                                    ${amountStr}
                                </span>
                                <CopyButton text={amountStr} />
                            </div>
                        </div>
                    </div>

                    {/* F&F Warning */}
                    <div style={S.warning}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <p style={S.warningText}>
                            You <strong>must</strong> select <strong>&ldquo;Friends &amp; Family&rdquo;</strong> when sending.
                            Please follow the payment instructions above. Your payment will be reviewed by our team.
                        </p>
                    </div>

                    {/* Steps */}
                    <ol style={S.steps}>
                        {[
                            "Log in to your PayPal account.",
                            <span key="a">Send exactly <strong style={{ color: "var(--accent)" }}>${amountStr}</strong> to the email shown above.</span>,
                            <span key="b">Choose <strong style={{ color: "var(--accent)" }}>&ldquo;Friends &amp; Family&rdquo;</strong> — never Goods &amp; Services.</span>,
                            <span key="c">In the <strong>note / message field</strong>, write only the word <strong style={{ color: "var(--accent)" }}>&ldquo;friend&rdquo;</strong> — nothing else. Never mention IPTV or streaming.</span>,
                            "Tap Send to complete the transfer in PayPal.",
                        ].map((step, i) => (
                            <li key={i} style={S.stepItem}>
                                <span style={S.stepNum}>{i + 1}</span>
                                <span style={S.stepText}>{step}</span>
                            </li>
                        ))}
                    </ol>

                    {/* Order summary */}
                    <Summary orderNumber={orderNumber} planName={planName} connections={connections} amountStr={amountStr} />

                    {/* CTAs */}
                    <div style={S.actions}>
                        <button style={S.btnPrimary} onClick={handleSentPayment}>
                            ✓ I&apos;ve Sent the Payment
                        </button>
                        <button style={S.btnCancel} onClick={handleCancel} disabled={cancelling}>
                            {cancelling ? "Cancelling…" : "✕ Cancel Order"}
                        </button>
                    </div>
                    {cancelError && <p style={S.errText}>{cancelError}</p>}
                    <SupportLinks links={supportLinks} />
                </div>
            </PageShell>
        );
    }

    // ─── Phase: Awaiting TXN (modal overlay) ───
    if (phase === "awaiting_txn") {
        return (
            <PageShell step={4} backHref={backHref}>
                <TxnModal
                    onConfirm={handleTxnConfirm}
                    onClose={() => setPhase("instructions")}
                    isSaving={savingTxn}
                    error={txnError}
                />
                <div style={{ ...S.card, opacity: 0.4, pointerEvents: "none" }}>
                    <div style={S.cardHeader}>
                        <h1 style={S.title}>Enter Transaction ID</h1>
                    </div>
                </div>
            </PageShell>
        );
    }

    // ─── Phase: Under Review ───
    return (
        <PageShell step={5} backHref={backHref}>
            <div style={S.card}>
                <div style={S.cardHeader}>
                    <div style={{ ...S.badge, background: "rgba(201,169,110,0.12)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                        </svg>
                        Under Review
                    </div>
                    <h1 style={S.title}>Payment Under Review</h1>
                    <p style={S.subtitle}>
                        Our team will verify your payment shortly. Your IPTV account details will be
                        sent to your <strong>WhatsApp or email</strong>.
                    </p>
                </div>

                {/* Receipt */}
                <div style={S.summary}>
                    <p style={S.summaryTitle}>📄 Payment Receipt</p>
                    <SummaryRow label="Order #" value={`#${orderNumber}`} />
                    <SummaryRow label="Plan" value={planName} />
                    <SummaryRow label="Devices" value={connections} />
                    <SummaryRow label="Amount Sent" value={`$${amountStr}`} accent />
                    <SummaryRow label="Sent To" value={paypalEmail} />
                    {txnId && <SummaryRow label="Transaction ID" value={txnId} small />}
                    <SummaryRow label="Your Email" value={customerEmail} />
                </div>

                {/* Next steps */}
                <div style={S.nextBox}>
                    <p style={S.nextTitle}>What happens next?</p>
                    <ul style={S.nextList}>
                        <li>Our team receives your payment notification</li>
                        <li>We verify the transaction manually (usually within 10 minutes–4 hours)</li>
                        <li>Your credentials will be sent to your <strong>email or WhatsApp</strong></li>
                    </ul>
                </div>

                <div style={S.actions}>
                    <button style={S.btnPrimary} onClick={() => router.push("/")}>
                        Return to Homepage
                    </button>
                </div>
                <SupportLinks links={supportLinks} />
            </div>
        </PageShell>
    );
}

/* ─── Sub-components ─── */
function Summary({ orderNumber, planName, connections, amountStr }: { orderNumber: string; planName: string; connections: string; amountStr: string }) {
    return (
        <div style={S.summary}>
            <p style={S.summaryTitle}>Order Summary</p>
            <SummaryRow label="Order #" value={`#${orderNumber}`} />
            <SummaryRow label="Plan" value={planName} />
            <SummaryRow label="Devices" value={connections} />
            <SummaryRow label="Amount" value={`$${amountStr}`} accent />
        </div>
    );
}

function SummaryRow({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
    return (
        <div style={S.summaryRow}>
            <span>{label}</span>
            <span style={{ color: accent ? "var(--accent)" : undefined, fontWeight: accent ? 700 : undefined, fontSize: small ? "0.78rem" : undefined, wordBreak: "break-all", textAlign: "right", maxWidth: "60%" }}>
                {value}
            </span>
        </div>
    );
}

function SupportLinks({ links = DEFAULT_SUPPORT_LINKS }: { links?: SupportLinksData }) {
    return (
        <div style={S.support}>
            <p style={S.supportLabel}>Need help?</p>
            <div style={S.supportLinks}>
                {[
                    { href: links.whatsapp, label: "WhatsApp", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg> },
                    { href: links.telegram, label: "Telegram", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg> },
                    { href: `mailto:${links.email}`, label: "Email", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg> },
                ].map(({ href, label, icon }) => (
                    <a key={label} href={href} target={href.startsWith("mailto") ? undefined : "_blank"} rel="noopener noreferrer" style={S.supportBtn}>
                        {icon} {label}
                    </a>
                ))}
            </div>
        </div>
    );
}

/* ─── Styles ─── */
const S: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-primary)" },
    stepWrap: { padding: "1.25rem 1.5rem 0", maxWidth: 900, width: "100%", margin: "0 auto" },
    main: { flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "1.5rem 1rem 2rem" },
    card: { width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: "1.1rem" },
    cardHeader: { textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.45rem" },
    badge: { display: "inline-flex", alignItems: "center", gap: "0.35rem", borderRadius: 99, padding: "0.28rem 0.75rem", fontSize: "0.78rem", fontWeight: 600 },
    title: { fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 },
    subtitle: { fontSize: "0.87rem", color: "var(--text-secondary)", maxWidth: 420, lineHeight: 1.6 },
    timerBox: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.65rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", transition: "all 0.3s" },
    infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" },
    infoBlock: { background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.3rem" },
    infoLabel: { fontSize: "0.7rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 },
    infoRow: { display: "flex", alignItems: "center", gap: "0.4rem" },
    infoVal: { fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 600, wordBreak: "break-all", flex: 1 },
    copyBtn: { background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0.2rem", borderRadius: 4, display: "flex", alignItems: "center", flexShrink: 0 },
    warning: { display: "flex", gap: "0.6rem", alignItems: "flex-start", background: "rgba(201,169,110,0.07)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-sm)", padding: "0.8rem 1rem" },
    warningText: { fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 },
    steps: { display: "flex", flexDirection: "column", gap: "0.7rem", listStyle: "none", padding: 0, margin: 0 },
    stepItem: { display: "flex", gap: "0.7rem", alignItems: "flex-start" },
    stepNum: { width: 24, height: 24, minWidth: 24, borderRadius: "50%", background: "var(--bg-elevated)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0, marginTop: 2 },
    stepText: { fontSize: "0.87rem", color: "var(--text-secondary)", lineHeight: 1.6 },
    summary: { background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.5rem" },
    summaryTitle: { fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700, marginBottom: "0.2rem" },
    summaryRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.87rem", color: "var(--text-secondary)", gap: "0.75rem" },
    nextBox: { background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.18)", borderRadius: "var(--radius-md)", padding: "1rem 1.2rem" },
    nextTitle: { fontSize: "0.72rem", fontWeight: 700, color: "var(--success)", marginBottom: "0.55rem", textTransform: "uppercase", letterSpacing: "0.05em" },
    nextList: { margin: 0, padding: "0 0 0 1.1rem", display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.87rem", color: "var(--text-secondary)" } as React.CSSProperties,
    actions: { display: "flex", flexDirection: "column", gap: "0.55rem" },
    btnPrimary: { width: "100%", padding: "0.9rem", background: "var(--accent)", color: "var(--on-accent-manual)", borderRadius: "var(--radius-md)", border: "none", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" },
    btnOutline: { width: "100%", padding: "0.75rem", background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: "var(--radius-md)", fontWeight: 600, fontSize: "0.88rem", cursor: "pointer" },
    btnCancel: { width: "100%", padding: "0.75rem", background: "transparent", border: "1px solid rgba(248,113,113,0.3)", color: "var(--error)", borderRadius: "var(--radius-md)", fontWeight: 600, fontSize: "0.88rem", cursor: "pointer" },
    errText: { color: "var(--error)", fontSize: "0.82rem", textAlign: "center" },
    errWrap: { display: "flex", flexDirection: "column", alignItems: "center", padding: "4rem", gap: "1rem" },
    support: { borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.55rem" },
    supportLabel: { fontSize: "0.72rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" },
    supportLinks: { display: "flex", gap: "0.55rem", flexWrap: "wrap", justifyContent: "center" },
    supportBtn: { display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.85rem", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.8rem", fontWeight: 600 },
    // Modal
    overlay: { position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" },
    modal: { background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "1.5rem", maxWidth: 400, width: "100%", display: "flex", flexDirection: "column", gap: "1rem" },
    modalTitle: { fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 },
    modalHint: { fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 },
    modalInput: { width: "100%", padding: "0.7rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "0.9rem", outline: "none" },
    modalActions: { display: "flex", gap: "0.6rem", justifyContent: "flex-end" },
    modalSkip: { padding: "0.5rem 0.9rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.83rem", fontWeight: 600 },
    modalConfirm: { padding: "0.5rem 1.1rem", background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)", color: "var(--on-accent-manual)", cursor: "pointer", fontSize: "0.83rem", fontWeight: 700 },
};

export default function PaypalPendingClient({ backHref, supportLinks }: PaypalPendingClientProps) {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg-primary)" }} />}>
            <PaypalPendingContent backHref={backHref} supportLinks={supportLinks} />
        </Suspense>
    );
}
