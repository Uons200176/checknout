"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useCheckoutRouter as useRouter } from "../../lib/use-checkout-router";
import { useCheckoutOrder } from "../../lib/use-checkout-order";
import { giftcardIssue } from "../../lib/giftcard-display";
import CheckoutHeader from "../../components/CheckoutHeader";
import CheckoutFooter from "../../components/CheckoutFooter";
import UnifiedStepIndicator from "../../components/UnifiedStepIndicator";

interface SupportLinksData {
    whatsapp: string;
    telegram: string;
    email: string;
}

interface GiftcardPendingClientProps {
    /** Where "Back" should go — resolved server-side from the request's Host header. */
    backHref?: string;
    /** Per-brand support contact links, resolved server-side from site_settings. */
    supportLinks?: SupportLinksData;
    /** External store link to buy the prepaid gift card (server-resolved). */
    purchaseUrl?: string | null;
}

const DEFAULT_SUPPORT_LINKS: SupportLinksData = {
    whatsapp: "https://wa.me/message/6CPS42MOC2DHB1",
    telegram: "https://t.me/iptv_support0",
    email: "support@epixiptv.tv",
};

/** Module-scope shell so React keeps the instance across ticks (no input remount). */
function PageShell({ step, backHref, children }: { step: number; backHref?: string; children: React.ReactNode }) {
    return (
        <div style={S.page}>
            <CheckoutHeader backHref={backHref} />
            <div style={S.stepWrap}>
                <UnifiedStepIndicator currentStep={step} />
            </div>
            <main style={S.main}>{children}</main>
            <CheckoutFooter />
        </div>
    );
}

/* ─── Amount rounding: 14.99 → 15, 12.00 → 12, 12.50 → 12.50 ─── */
function formatAmount(price: number): string {
    return price.toFixed(2).replace(/\.00$/, "");
}

/** Plausibility only: full verification and value checks are server-side. */
function normalizeCode(raw: string): string {
    return raw.replace(/[\s-]/g, "").toUpperCase();
}
function isValidCode(raw: string): boolean {
    return raw.length <= 100 && /^[A-Z0-9]{12,64}$/.test(normalizeCode(raw));
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

/* ─── Isolated Timer Banner ─── */
function SessionTimerBanner({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
    const { remaining, display, expired } = useCountdown(expiresAt);
    const hasAutoExpired = useRef(false);

    useEffect(() => {
        if (expired && !hasAutoExpired.current) {
            hasAutoExpired.current = true;
            onExpire();
        }
    }, [expired, onExpire]);

    if (!expiresAt) return null;
    const urgent = remaining < 120;
    const mid = remaining < 300;

    return (
        <div style={{
            ...S.timerBox,
            borderColor: urgent ? "rgba(248,113,113,0.4)" : mid ? "rgba(245,158,11,0.4)" : "var(--border)",
            background: urgent ? "rgba(248,113,113,0.06)" : mid ? "rgba(245,158,11,0.06)" : "var(--bg-elevated)",
        }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={urgent ? "var(--error)" : mid ? "var(--warning)" : "var(--text-tertiary)"} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
            <span style={{ color: urgent ? "var(--error)" : mid ? "var(--warning)" : "var(--text-secondary)", fontSize: "0.85rem" }}>
                Session expires in{" "}
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{display}</strong>
                {urgent && " — enter your code now!"}
            </span>
        </div>
    );
}

/* ─── Main Content ─── */
function GiftcardPendingContent({ backHref, supportLinks = DEFAULT_SUPPORT_LINKS, purchaseUrl }: GiftcardPendingClientProps) {
    const searchParams = useSearchParams();
    const router = useRouter();

    const orderId = searchParams.get("orderId") || "";
    const { order, error: orderError, refresh, displayExpiresAt: expiresAt } = useCheckoutOrder(orderId, "giftcard");
    const orderNumber = String(order?.orderNumber ?? "");
    const planName = order?.planName ?? "";
    const planPrice = Number(order?.planPrice ?? 0);
    const connections = String(order?.connections ?? "");
    const customerEmail = order?.customerEmail ?? "";


    const amountStr = formatAmount(planPrice);

    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState("");

    const phase = order?.status === "cancelled" ? "expired"
        : order && ["pending", "completed", "processing"].includes(order.status) ? "review" : "instructions";
    const redemption = order?.redemption;

    // Countdown only prompts a server refresh; it cannot cancel or confirm orders.
    const handleExpire = useCallback(() => { void refresh(); }, [refresh]);

    const handleSubmitCode = async () => {
        if (submitting || order?.redemptionAvailable !== true) return;
        setSubmitError("");
        if (!isValidCode(code)) {
            setSubmitError("Paste the complete Rewarble gift-card code, not the G2A order number. Follow step 2 above to find it.");
            return;
        }
        if (!orderId) return;
        setSubmitting(true);
        try {
            const res = await fetch("/api/payments/giftcard/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, code: normalizeCode(code) }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setSubmitError(d.error || "Failed to submit the code. Please try again.");
                await refresh();
                setSubmitting(false);
                return;
            }
            const result = await res.json();
            if (["rejected", "retryable"].includes(result.redemption?.state)) {
                setSubmitError(giftcardIssue(result.redemption?.reason));
            } else { setCode(""); }
            await refresh();
        } catch {
            setSubmitError("Connection interrupted. Refresh this order to check the result before retrying the same code. Do not submit another card.");
            await refresh();
            setSubmitting(false);
            return;
        }
        setSubmitting(false);
    };

    const handleCancel = useCallback(async () => {
        if (!orderId) return;
        setCancelling(true);
        setCancelError("");
        try {
            const res = await fetch("/api/payments/giftcard/cancel", {
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

    // ─── Phase: Expired ───
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
                            This checkout is closed. If you already bought a card, contact support before starting again. Do not buy another card.
                        </p>
                    </div>
                    <button style={S.btnPrimary} onClick={() => router.push("/checkout?step=3")}>↩ Try Again</button>
                    <button style={S.btnOutline} onClick={() => router.push("/")}>Return to Homepage</button>
                    <SupportLinks links={supportLinks} />
                </div>
            </PageShell>
        );
    }

    // ─── Phase: Under Review ───
    if (phase === "review") {
        return (
            <PageShell step={5} backHref={backHref}>
                <div style={S.card}>
                    <div style={S.cardHeader}>
                        <div style={{ ...S.badge, background: "rgba(201,169,110,0.12)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                            </svg>
                            {order.status === "completed" ? "Completed" : redemption?.state === "redeeming" ? "Verifying with Rewarble" : "Under Review"}
                        </div>
                        <h1 style={S.title}>{order.status === "completed" ? "Order Completed" : redemption?.state === "verified" ? "Payment Verified — Order Under Review" : redemption?.state === "redeeming" ? "Checking Your Gift Card" : "Payment Needs Review"}</h1>
                        <p style={S.subtitle} role="status">
                            {order.status === "completed" ? "Your order has been completed. Contact support if you need help with your account details."
                                : redemption?.state === "verified"
                                ? "Rewarble confirmed the card value and currency. Our team will prepare your account and send the details by email or WhatsApp."
                                : redemption?.state === "redeeming"
                                ? "Your code is being redeemed securely on our server. You can return to this page to see the result. Please do not submit another card."
                                : redemption ? giftcardIssue(redemption.reason)
                                : "Your submitted payment is being reviewed by our team. Please contact support if you need an update."}
                        </p>
                    </div>

                    <div style={S.summary}>
                        <p style={S.summaryTitle}>📄 Order Receipt</p>
                        <SummaryRow label="Order #" value={`#${orderNumber}`} />
                        <SummaryRow label="Plan" value={planName} />
                        <SummaryRow label="Devices" value={connections} />
                        <SummaryRow label="Amount" value={`$${amountStr}`} accent />
                        {redemption?.codeLast4 && <SummaryRow label="Card ending" value={`•••• ${redemption.codeLast4}`} small />}
                        {redemption?.faceValue != null && <SummaryRow label="Redeemed card value" value={`${redemption.currency} ${formatAmount(Number(redemption.faceValue))}`} />}
                        <SummaryRow label="Your Email" value={customerEmail} />
                    </div>

                    <div style={S.nextBox}>
                        <p style={S.nextTitle}>What happens next?</p>
                        <ul style={S.nextList}>
                            <li>Card value and currency are checked on the server</li>
                            <li>Account preparation starts after payment is accepted</li>
                            <li>Our team sends your credentials by <strong>email or WhatsApp</strong></li>
                        </ul>
                    </div>

                    <div style={S.actions}>
                        <button style={S.btnPrimary} onClick={() => router.push("/")}>Return to Homepage</button>
                    </div>
                    <SupportLinks links={supportLinks} />
                    <button style={S.btnOutline} onClick={() => void refresh()}>Refresh payment status</button>
                </div>
            </PageShell>
        );
    }

    // ─── Phase: Instructions ───
    const codeOk = isValidCode(code);
    return (
        <PageShell step={4} backHref={backHref}>
            <div style={S.card}>
                <div style={S.cardHeader}>
                    <div style={{ ...S.badge, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--giftcard-text)" }}>
                        <span>Credit / Debit Card — Gift Card</span>
                    </div>
                    <h1 style={S.title}>Complete Your Payment</h1>
                    <p style={S.subtitle}>
                        Buy your gift card on G2A, open your order email, then reveal and copy the gift-card code here.
                        <strong> We need the gift-card code — not your G2A order number.</strong>
                    </p>
                </div>

                <SessionTimerBanner expiresAt={expiresAt} onExpire={handleExpire} />

                {/* Amount to pay */}
                <div style={S.infoGrid}>
                    <div style={{ ...S.infoBlock, gridColumn: "1 / -1" }}>
                        <span style={S.infoLabel}>Amount to pay</span>
                        <div style={S.infoRow}>
                            <span style={{ ...S.infoVal, color: "var(--accent)", fontSize: "1.25rem", fontWeight: 700 }}>${amountStr}</span>
                            <CopyButton text={amountStr} />
                        </div>
                    </div>
                </div>

                {/* ═══ PART 1 — buy the card ═══ */}
                <div style={S.partHead}>
                    <span style={S.partNum}>1</span>
                    <span style={S.partTitle}>Buy your gift card on G2A</span>
                </div>

                    {purchaseUrl && order.redemptionAvailable === true ? (
                    <a href={purchaseUrl} target="_blank" rel="noopener noreferrer" style={S.openStoreBtn}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        Open G2A to buy the gift card
                    </a>
                ) : (
                    <div style={S.warning}>
                        <p style={S.warningText}>
                            Gift-card purchase or verification is currently unavailable — please contact support before buying a card.
                        </p>
                    </div>
                )}

                {/* The single most important instruction on the page: the purchase
                    happens on someone else's site, so a customer who closes this tab
                    has nowhere to put the code they just paid for. */}
                <div style={S.returnNotice}>
                    <span style={S.returnIcon} aria-hidden="true">!</span>
                    <p style={S.returnText}>
                        <strong>Keep this checkout page open.</strong> G2A opens in a new tab.
                        After paying and revealing your code, return here to submit it.
                    </p>
                </div>

                <ol style={S.steps}>
                    {[
                        <span key="1">Use the G2A link above to purchase the gift card selected for your plan. Check the product and total before paying.</span>,
                        <span key="2">Complete payment on G2A and use an <strong>email address you can access</strong>. You will need the G2A order email in the next step.</span>,
                    ].map((step, i) => (
                        <li key={i} style={S.stepItem}>
                            <span style={S.stepNum}>{i + 1}</span>
                            <span style={S.stepText}>{step}</span>
                        </li>
                    ))}
                </ol>

                {/* Retrieving the code is a separate task from paying for the order. */}
                <section aria-labelledby="g2a-retrieve-title" style={S.retrievalBox}>
                    <div style={S.partHead}>
                        <span style={S.partNum}>2</span>
                        <h2 id="g2a-retrieve-title" style={{ ...S.partTitle, margin: 0 }}>After paying: find your gift-card code</h2>
                    </div>
                    <ol style={S.steps}>
                        {[
                            <span key="email"><strong>Open your email inbox.</strong> Find the order email from G2A, sent to the address you used for the purchase. Check Spam or Promotions if needed.</span>,
                            <span key="order">In that email, click <strong style={{ color: "var(--accent)" }}>&ldquo;Get order&rdquo;</strong> to open your G2A order page.</span>,
                            <span key="reveal"><strong>Scroll down to the gift card.</strong> Use the button that generates or reveals the code, then wait for the gift-card code to appear. Button wording may vary.</span>,
                            <span key="copy"><strong>Copy the revealed gift-card code.</strong> Return to this checkout tab and paste it below — do not copy the order number or payment reference.</span>,
                        ].map((step, i) => (
                            <li key={i} style={S.stepItem}>
                                <span style={S.stepNum}>{i + 1}</span>
                                <span style={S.stepText}>{step}</span>
                            </li>
                        ))}
                    </ol>
                    <p style={S.returnText}><strong>Already paid but cannot find the code?</strong> Do not buy another card. Follow the steps above or contact support below. Never share your G2A password or bank-card details.</p>
                </section>

                {/* ═══ PART 3 — the field they came back for ═══ */}
                <div style={{ ...S.partHead, marginTop: "0.4rem" }}>
                    <span style={{ ...S.partNum, background: "var(--accent)", color: "var(--on-accent-manual)", borderColor: "var(--accent)" }}>3</span>
                    <span style={S.partTitle}>Paste the revealed gift-card code</span>
                </div>

                <div style={S.codeBlock}>
                    <label style={S.codeLabel} htmlFor="giftcard-code">Gift-card code — NOT the G2A order number</label>
                    <p id="giftcard-code-warning" style={S.codeWarning}>
                        An &ldquo;Order number&rdquo;, &ldquo;Order ID&rdquo; or payment reference is <strong>not</strong> the gift-card code.
                        The correct code appears after you reveal it on the G2A order page.
                    </p>
                    <input
                        id="giftcard-code"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Paste gift-card code"
                        aria-describedby={`giftcard-code-warning giftcard-code-hint${submitError ? " giftcard-code-error" : ""}`}
                        aria-invalid={Boolean(submitError)}
                        value={code}
                        onChange={e => { setCode(e.target.value); if (submitError) setSubmitError(""); }}
                        onKeyDown={e => { if (e.key === "Enter" && codeOk && !submitting && order.redemptionAvailable === true) handleSubmitCode(); }}
                        disabled={submitting || order.redemptionAvailable !== true}
                        style={{
                            ...S.codeInput,
                            borderColor: submitError ? "var(--error)" : codeOk ? "var(--accent)" : "var(--border)",
                        }}
                    />
                    <p id="giftcard-code-hint" style={S.codeHint}>
                        Paste the full Rewarble code. Spaces and dashes are ignored.
                        {" "}<strong style={{ color: "var(--accent)" }}>Redeem &amp; Verify</strong> consumes the card and adds its value to our merchant account for this order. A different currency or insufficient value requires review.
                    </p>
                </div>

                {/* Order summary */}
                <Summary orderNumber={orderNumber} planName={planName} connections={connections} amountStr={amountStr} />

                {/* CTAs */}
                <div style={S.actions}>
                    <button
                        style={{ ...S.btnPrimary, opacity: submitting || order.redemptionAvailable !== true ? 0.7 : 1, cursor: submitting || order.redemptionAvailable !== true ? "not-allowed" : "pointer" }}
                        onClick={handleSubmitCode}
                        disabled={submitting || order.redemptionAvailable !== true}
                    >
                        {submitting ? "Redeeming & Verifying…" : "✓ Redeem & Verify"}
                    </button>
                    <button style={S.btnCancel} onClick={handleCancel} disabled={cancelling || submitting}>
                        {cancelling ? "Cancelling…" : "✕ Cancel Order"}
                    </button>
                </div>
                {submitError && <p id="giftcard-code-error" role="alert" style={S.errText}>{submitError}</p>}
                {!submitError && redemption && ["rejected", "retryable"].includes(redemption.state) && <p role="alert" style={S.errText}>{giftcardIssue(redemption.reason)}</p>}
                {cancelError && <p style={S.errText}>{cancelError}</p>}
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
            <SummaryRow label="Checkout reference (not the gift-card code)" value={`#${orderNumber}`} />
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
            <span style={{ color: accent ? "var(--accent)" : undefined, fontWeight: accent ? 700 : undefined, fontSize: small ? "0.78rem" : undefined, wordBreak: "break-all", textAlign: "right", maxWidth: "60%", flexShrink: 0 }}>
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
    subtitle: { fontSize: "0.87rem", color: "var(--text-secondary)", maxWidth: 440, lineHeight: 1.6 },
    timerBox: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.65rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", transition: "all 0.3s" },
    infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" },
    infoBlock: { background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.3rem" },
    infoLabel: { fontSize: "0.7rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 },
    infoRow: { display: "flex", alignItems: "center", gap: "0.4rem" },
    infoVal: { fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 600, wordBreak: "break-all", flex: 1 },
    copyBtn: { background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0.2rem", borderRadius: 4, display: "flex", alignItems: "center", flexShrink: 0 },
    // The primary action of part 1 — it now looks like one. It was a muted
    // outline button sitting in a wall of text, which is why it read as optional.
    openStoreBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.6rem", width: "100%", padding: "1.15rem", background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--on-accent-manual)", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "1.02rem", textDecoration: "none" },

    // Numbered section headings, so the page reads as two jobs rather than one
    // long list with a field buried in the middle of it.
    partHead: { display: "flex", alignItems: "center", gap: "0.6rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.6rem" },
    partNum: { width: 26, height: 26, minWidth: 26, borderRadius: "50%", background: "var(--bg-elevated)", border: "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0 },
    partTitle: { fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" },

    returnNotice: { display: "flex", gap: "0.7rem", alignItems: "flex-start", background: "rgba(201,169,110,0.09)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-md)", padding: "0.9rem 1rem" },
    returnIcon: { width: 22, height: 22, minWidth: 22, borderRadius: "50%", background: "var(--accent)", color: "var(--on-accent-manual)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 800, flexShrink: 0, marginTop: 1 },
    returnText: { fontSize: "0.87rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 },
    warning: { display: "flex", gap: "0.6rem", alignItems: "flex-start", background: "rgba(201,169,110,0.07)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-sm)", padding: "0.8rem 1rem" },
    warningText: { fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 },
    steps: { display: "flex", flexDirection: "column", gap: "0.7rem", listStyle: "none", padding: 0, margin: 0 },
    stepItem: { display: "flex", gap: "0.7rem", alignItems: "flex-start" },
    stepNum: { width: 24, height: 24, minWidth: 24, borderRadius: "50%", background: "var(--bg-elevated)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0, marginTop: 2 },
    stepText: { fontSize: "0.87rem", color: "var(--text-secondary)", lineHeight: 1.6 },
    // This is what the customer navigates back to the tab for, so it is given a
    // heavier border and a tint rather than looking like one more grey panel.
    codeBlock: { background: "rgba(201,169,110,0.06)", border: "2px solid var(--accent-border)", borderRadius: "var(--radius-md)", padding: "1.2rem", display: "flex", flexDirection: "column", gap: "0.6rem" },
    retrievalBox: { background: "var(--bg-elevated)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)", borderRadius: "var(--radius-md)", padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" },
    codeWarning: { fontSize: "0.82rem", lineHeight: 1.6, color: "var(--text-primary)", margin: 0, textAlign: "center" },
    codeLabel: { fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)", textAlign: "center" },
    codeInput: { width: "100%", padding: "0.85rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "1.05rem", letterSpacing: "0.08em", fontWeight: 600, outline: "none", textAlign: "center", fontVariantNumeric: "tabular-nums" },
    codeHint: { fontSize: "0.75rem", color: "var(--text-tertiary)", margin: 0, textAlign: "center" },
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
};

export default function GiftcardPendingClient({ backHref, supportLinks, purchaseUrl }: GiftcardPendingClientProps) {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg-primary)" }} />}>
            <GiftcardPendingContent backHref={backHref} supportLinks={supportLinks} purchaseUrl={purchaseUrl} />
        </Suspense>
    );
}
