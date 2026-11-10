"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useCheckoutRouter as useRouter } from "../lib/use-checkout-router";
import { themedCheckoutHref } from "../lib/checkout-theme";
import CheckoutHeader from "../components/CheckoutHeader";
import CheckoutFooter from "../components/CheckoutFooter";
import UnifiedStepIndicator from "../components/UnifiedStepIndicator";
import FormInput from "../components/FormInput";
import { LIMITS } from "@/app/lib/customer-input";
import FormSelect from "../components/FormSelect";
import RadioOption from "../components/RadioOption";
import PaymentMethodCard from "../components/PaymentMethodCard";
import TurnstileWidget from "../components/TurnstileWidget";
import { countries } from "../data/countries";
import type { Plan } from "../data/plans";
import type { PaymentMethodConfig } from "../config/paymentMethods";
import { formatMoney } from "../lib/currency";
import { solvePow } from "../lib/pow";
import { durationLabel, isRtl, type CheckoutDict, type Lang } from "../lib/i18n";
import {
    PaypalIcon,
    CryptocurrencyIcon,
    CardIcon,
    CardViaCryptoIcon,
    BitcoinIcon,
    EthereumIcon,
    UsdtIcon,
    UsdcIcon,
    BnbIcon,
    TronIcon,
    VisaIcon,
    MasterCardIcon,
    AmericanExpressIcon,
    GooglePayIcon,
    DiscoverIcon,
    UnionpayIcon,
} from "../assets/payment-icons";

/**
 * Icon map — each key matches a PaymentMethodConfig.id.
 * Add a new icon here whenever you add a new method to paymentMethods.ts.
 */
const PAYMENT_ICONS: Record<string, React.ReactNode> = {
    paypal: <PaypalIcon size={28} />,
    crypto: <CryptocurrencyIcon size={28} />,
    card: <CardIcon size={28} />,
    "card-crypto": <CardViaCryptoIcon size={28} />,
    giftcard: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M2 12h20M12 7v14" />
            <path d="M12 7c-1.2-2.2-4.5-2.2-4.5 0 0 1.4 2.6 1.4 4.5 0 1.9 1.4 4.5 1.4 4.5 0 0-2.2-3.3-2.2-4.5 0z" />
        </svg>
    ),
};

/**
 * Sub-icons shown below the card description (supported currencies/networks)
 */
const PAYMENT_SUB_ICONS: Record<string, React.ReactNode[]> = {
    crypto: [
        <BitcoinIcon key="btc" size={20} />,
        <EthereumIcon key="eth" size={20} />,
        <UsdtIcon key="usdt" size={20} />,
        <UsdcIcon key="usdc" size={20} />,
        <BnbIcon key="bnb" size={20} />,
        <TronIcon key="trx" size={20} />,
    ],
    card: [
        <VisaIcon key="visa" size={34} />,
        <MasterCardIcon key="mc" size={34} />,
        <AmericanExpressIcon key="amex" size={34} />,
        <GooglePayIcon key="gpay" size={34} />,
        <DiscoverIcon key="disc" size={34} />,
        <UnionpayIcon key="up" size={34} />,
    ],
    "card-crypto": [
        <VisaIcon key="visa" size={34} />,
        <MasterCardIcon key="mc" size={34} />,
        <AmericanExpressIcon key="amex" size={34} />,
        <GooglePayIcon key="gpay" size={34} />,
    ],
    giftcard: [
        <VisaIcon key="visa" size={34} />,
        <MasterCardIcon key="mc" size={34} />,
        <AmericanExpressIcon key="amex" size={34} />,
        <GooglePayIcon key="gpay" size={34} />,
        <DiscoverIcon key="disc" size={34} />,
    ],
};

/** Payment create endpoints — the request body is identical for all methods. */
const PAYMENT_ENDPOINTS: Record<string, string> = {
    crypto: "/api/payments/crypto/create",
    "card-crypto": "/api/payments/card/create",
    paypal: "/api/payments/paypal/create",
    giftcard: "/api/payments/giftcard/create",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface CheckoutContentProps {
    /** Where "Back" should go — resolved server-side from the request's Host header. */
    backHref?: string;
    /** Payment methods enabled for this site — resolved server-side from site_settings. */
    activePaymentMethods: PaymentMethodConfig[];
    /** Per-brand plan catalogue, priced for the current connection count (server-resolved). */
    plans: Plan[];
    /** True when ?plan= referenced a plan this brand doesn't offer. */
    planMissing?: boolean;
    /** ISO currency code the site displays/charges in. */
    currency: string;
    lang: Lang;
    dict: CheckoutDict;
    /** Brand identity from site_settings (logo + display name). */
    brand?: { name?: string; logoUrl?: string };
    /** Per-site support links from site_settings. */
    supportLinks?: { whatsapp?: string | null; telegram?: string | null; email?: string | null };
}

/** Proof-of-Work challenge issued by /api/payments/challenge. Whether captcha is
 *  required (and the site key) is decided server-side and returned here — the
 *  DB `create_order` RPC is the sole authority, so the widget follows this. */
interface Challenge {
    token: string;
    difficulty: number;
    captchaRequired: boolean;
    siteKey: string | null;
}

/** One payment method's price, from /api/checkout/pricing. Final numbers only —
 *  the discount rules stay in the database and never reach the browser. */
interface MethodPrice {
    price: number;
    original: number;
    off: number;
}

/* ─── Main Component ─── */
function CheckoutContent({
    backHref,
    activePaymentMethods,
    plans,
    planMissing,
    currency,
    lang,
    dict: t,
    brand,
    supportLinks,
}: CheckoutContentProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const planId = searchParams.get("plan") || "";
    const connections = Math.min(5, Math.max(1, parseInt(searchParams.get("connections") || "1", 10)));
    const plan =
        plans.find((p) => p.id === planId) ??
        plans.find((p) => p.popular) ??
        plans[0];

    const [currentStep, setCurrentStep] = useState(1);

    // Step 1
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [country, setCountry] = useState("");
    const [phoneCode, setPhoneCode] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    // Step 2
    const [deviceInfo, setDeviceInfo] = useState("");
    const [hasPlayer, setHasPlayer] = useState<string>("");

    // Step 3
    const [paymentMethod, setPaymentMethod] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");

    // Per-method prices, re-fetched every time the customer lands on step 3 (see
    // the effect below). `plans` came from the first server render and cannot
    // know about a discount edited since, nor which method is about to be picked.
    const [methodPrices, setMethodPrices] = useState<Record<string, MethodPrice> | null>(null);

    // Which methods the SERVER says this customer may be offered. A method is
    // hidden only on an explicit `false`, so a failed lookup cannot empty the
    // payment step — the create route is the actual gate.
    const [allowedMethods, setAllowedMethods] = useState<Record<string, boolean>>({});
    const [methodsLoading, setMethodsLoading] = useState(false);
    const [methodsError, setMethodsError] = useState("");
    const methodsRequest = useRef(0);

    // Anti-abuse: Proof-of-Work challenge + (optional) captcha, both server-driven.
    const [captchaToken, setCaptchaToken] = useState("");
    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [nonce, setNonce] = useState<number | null>(null);
    const [preparing, setPreparing] = useState(false);
    const [challengeError, setChallengeError] = useState("");

    const captchaActive = !!(challenge?.captchaRequired && challenge.siteKey);

    // The selected method's price once known, else the server-rendered one. Only
    // ever affects what is DISPLAYED — the charge is re-resolved server-side.
    const selectedPrice = paymentMethod ? methodPrices?.[paymentMethod] : undefined;
    const total = selectedPrice?.price ?? plan.price;
    const totalBefore = selectedPrice?.original ?? plan.price;
    const totalOff = selectedPrice?.off ?? 0;
    const rtl = isRtl(lang);

    useEffect(() => {
        if (country) {
            const c = countries.find((c) => c.code === country);
            if (c) setPhoneCode(c.dial);
        } else {
            setPhoneCode("");
        }
    }, [country]);

    // ── PayGate return detection ──────────────────────────────────────
    // If user returns from PayGate checkout (e.g. browser Back button),
    // redirect them to payment-status to track their order.
    useEffect(() => {
        try {
            const savedOrderId = sessionStorage.getItem("paygate_orderId");
            if (savedOrderId) {
                // Clear the stored orderId so we don't redirect again
                sessionStorage.removeItem("paygate_orderId");
                router.replace(
                    `/checkout/payment-status?orderId=${savedOrderId}&method=card-crypto&lang=${lang}`
                );
            }
        } catch { /* sessionStorage not available */ }
    }, [router, lang]);

    // ── Restore form data + step position ───────────────────────────────
    // Fields AND the current step are restored on every visit, so an accidental
    // refresh drops nothing — the customer lands exactly where they were. The
    // restored step is clamped to what the saved data actually supports (never
    // past an incomplete step). An explicit retry (?retry=1) or recovery-email
    // link (?recover=1) still jumps straight to the payment step.
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem("checkout_form");
            if (saved) {
                const d = JSON.parse(saved);
                if (d.fullName) setFullName(d.fullName);
                if (d.email) setEmail(d.email);
                if (d.phone) setPhone(d.phone);
                if (d.country) setCountry(d.country);
                if (d.deviceInfo) setDeviceInfo(d.deviceInfo);
                if (d.hasPlayer) setHasPlayer(d.hasPlayer);

                const step1ok = !!(d.fullName && d.email && d.country && d.phone);
                const step2ok = step1ok && !!d.hasPlayer;
                const wantsResume =
                    searchParams.get("retry") === "1" || searchParams.get("recover") === "1";

                if (wantsResume && d.fullName && d.email) {
                    setCurrentStep(3);
                } else if (typeof d.currentStep === "number") {
                    // Return to the saved step, but not beyond what the data covers.
                    let s = Math.min(3, Math.max(1, d.currentStep));
                    if (s >= 3 && !step2ok) s = step1ok ? 2 : 1;
                    if (s === 2 && !step1ok) s = 1;
                    setCurrentStep(s);
                }
            }
        } catch { /* ignore */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Persist form data + step position on every change ───────────────
    useEffect(() => {
        try {
            sessionStorage.setItem("checkout_form", JSON.stringify({
                fullName, email, phone, country, deviceInfo, hasPlayer,
                planId: plan.id, connections, currentStep,
            }));
        } catch { /* ignore */ }
    }, [fullName, email, phone, country, deviceInfo, hasPlayer, plan.id, connections, currentStep]);

    // ── Validation ──────────────────────────────────────────────────────
    const validateStep1 = (): boolean => {
        const errors: Record<string, string> = {};
        const nameTrimmed = fullName.trim();
        if (!nameTrimmed) errors.fullName = t.errRequired;
        else if (nameTrimmed.length <= LIMITS.nameMin) errors.fullName = t.errNameShort;
        else if (nameTrimmed.length > LIMITS.nameMax) errors.fullName = t.errNameLong;
        if (!email.trim()) errors.email = t.errRequired;
        else if (email.trim().length > LIMITS.emailMax) errors.email = t.errEmailLong;
        else if (!EMAIL_RE.test(email.trim())) errors.email = t.errEmail;
        if (!country) errors.country = t.errRequired;
        const digits = phone.replace(/\D/g, "");
        if (!phone.trim()) errors.phone = t.errRequired;
        else if (digits.length < 6 || digits.length > 15) errors.phone = t.errPhone;
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // Request a fresh PoW challenge. The pre-solve effect below picks it up and
    // brute-forces the nonce off the main thread. Called on entering step 3 and
    // after a failed submit (the token is single-use).
    const fetchChallenge = async () => {
        setPreparing(true);
        setChallengeError("");
        setNonce(null);
        setCaptchaToken("");
        try {
            const res = await fetch("/api/payments/challenge", { method: "POST" });
            const d = await res.json();
            if (res.ok && d?.token) {
                setChallenge({
                    token: d.token,
                    difficulty: d.difficulty,
                    captchaRequired: d.captchaRequired === true,
                    siteKey: d.siteKey ?? null,
                });
            } else {
                setChallenge(null);
                setPreparing(false);
                setChallengeError("Secure checkout could not start. Please retry.");
            }
        } catch {
            setChallenge(null);
            setPreparing(false);
            setChallengeError("Secure checkout could not start. Please retry.");
        }
    };

    // Ask the server what this plan costs under each payment method. Cheap, and
    // the only way a discount changed mid-session can reach an already-hydrated
    // page. A failure leaves the server-rendered price in place.
    const fetchMethodPrices = async () => {
        const generation = ++methodsRequest.current;
        setAllowedMethods({});
        setMethodPrices(null);
        setPaymentMethod("");
        setMethodsLoading(true);
        setMethodsError("");
        try {
            const res = await fetch("/api/checkout/pricing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: plan.id, connections,
                    // Needed for the visibility rules; the server re-derives the
                    // brand and the IP country itself and trusts neither of these
                    // on their own.
                    phone, phoneCode, email, country,
                }),
            });
            const d = await res.json();
            if (generation !== methodsRequest.current) return;
            if (!res.ok || !d?.methods || !d?.allowed) throw new Error("unavailable");
            setMethodPrices(d.methods);
            setAllowedMethods(d.allowed);
        } catch {
            if (generation === methodsRequest.current) setMethodsError("Could not load payment methods. Please retry.");
        } finally {
            if (generation === methodsRequest.current) setMethodsLoading(false);
        }
    };

    // Server-side groundwork, started once the contact details are valid.
    // Fire-and-forget on purpose: not awaited, no state, no error handling, and
    // the endpoint answers `{ ok: true }` no matter what happens. Nothing here
    // may become visible to the customer — not a spinner, not a delay, not a
    // failed request in the console. `keepalive` lets it finish even though the
    // step changes immediately after.
    const firePrecheck = () => {
        try {
            void fetch("/api/checkout/precheck", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, phoneCode, country }),
                keepalive: true,
            }).catch(() => { /* silent by design */ });
        } catch { /* silent by design */ }
    };

    const nextStep = () => {
        if (currentStep === 1) {
            if (!validateStep1()) {
                setSubmitError(t.errRequired);
                return;
            }
            setSubmitError("");
            firePrecheck();
        }
        if (currentStep === 2) {
            if (!hasPlayer) {
                setSubmitError(t.errSelectPlayer);
                return;
            }
            setSubmitError("");
        }
        if (currentStep < 3) {
            setAllowedMethods({});
            setCurrentStep(currentStep + 1);
        }
    };
    const prevStep = () => { ++methodsRequest.current; setAllowedMethods({}); setSubmitError(""); if (currentStep > 1) setCurrentStep(currentStep - 1); };

    const countryOptions = countries.map((c) => ({ value: c.code, label: `${c.name} (${c.dial})` }));

    // ── Fetch a PoW challenge once the user reaches the payment step ──────
    useEffect(() => {
        if (currentStep === 3 && !challenge) void fetchChallenge();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep]);

    // ── Drop a selection that is no longer on offer ───────────────────────
    // Going back and changing country or phone can withdraw a method the
    // customer had already picked. Without this the card disappears while the
    // choice silently persists, and Complete Order would be refused by the
    // server with no visible cause.
    useEffect(() => {
        if (paymentMethod && allowedMethods[paymentMethod] !== true) setPaymentMethod("");
    }, [allowedMethods, paymentMethod]);

    // ── Re-price on EVERY arrival at the payment step ─────────────────────
    // Deliberately no `&& !methodPrices` guard, unlike the challenge above:
    // stepping back to 2 and forward again must pick up a discount changed in
    // the meantime. That staleness is the whole reason this endpoint exists.
    useEffect(() => {
        if (currentStep === 3) void fetchMethodPrices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep, plan.id, connections]);

    // ── Pre-solve the PoW off the main thread (worker, inline fallback) ───
    useEffect(() => {
        if (!challenge) return;
        let cancelled = false;
        let worker: Worker | null = null;

        const solveInline = () => {
            const res = solvePow(challenge.token, challenge.difficulty);
            if (cancelled) return;
            if (res) setNonce(res.nonce);
            setPreparing(false);
        };

        try {
            worker = new Worker(new URL("../workers/pow-worker.ts", import.meta.url));
            worker.onmessage = (e: MessageEvent<{ ok: boolean; nonce?: number }>) => {
                if (cancelled) return;
                if (e.data?.ok && typeof e.data.nonce === "number") setNonce(e.data.nonce);
                setPreparing(false);
                worker?.terminate();
            };
            worker.onerror = () => {
                worker?.terminate();
                solveInline();
            };
            worker.postMessage({ token: challenge.token, difficulty: challenge.difficulty });
        } catch {
            solveInline();
        }

        return () => {
            cancelled = true;
            worker?.terminate();
        };
    }, [challenge]);

    // ── Complete Order handler ──────────────────────────────────────────
    const handleCompleteOrder = async () => {
        if (!paymentMethod || methodsLoading || methodsError || allowedMethods[paymentMethod] !== true) {
            setSubmitError(t.errSelectPayment);
            return;
        }
        const endpoint = PAYMENT_ENDPOINTS[paymentMethod];
        if (!endpoint) {
            setSubmitError(`Payment method "${paymentMethod}" is not configured yet`);
            return;
        }
        if (!challenge || nonce === null) {
            setSubmitError("Still preparing the secure checkout — please wait a moment.");
            if (!challenge && !preparing) void fetchChallenge();
            return;
        }
        if (captchaActive && !captchaToken) {
            setSubmitError(t.errCaptcha);
            return;
        }
        setSubmitError("");
        setSubmitting(true);

        try {
            const res = await fetch(themedCheckoutHref(endpoint), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token: challenge.token,
                    nonce,
                    captchaToken: captchaActive ? captchaToken : undefined,
                    planId: plan.id,
                    connections,
                    customerName: fullName,
                    customerEmail: email,
                    customerPhone: phone,
                    customerCountry: country,
                    deviceType: deviceInfo,
                    hasPlayer,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setSubmitError(data.error || t.errPaymentFailed);
                setSubmitting(false);
                // The PoW token is single-use — get a fresh challenge for the retry.
                void fetchChallenge();
                return;
            }

            if (paymentMethod === "crypto") {
                // Navigate to payment-status page with embedded iframe
                if (data.invoiceId) {
                    const params = new URLSearchParams({
                        orderId: data.orderId,
                        invoiceId: data.invoiceId,
                        lang,
                    });
                    router.push(`/checkout/payment-status?${params.toString()}`);
                    // keep submitting=true — page will navigate away
                } else {
                    setSubmitError(t.errNoPaymentUrl);
                    setSubmitting(false);
                }
            } else if (paymentMethod === "card-crypto") {
                // ── Card via Crypto (PayGate) — external redirect ─────────
                if (data.paymentUrl) {
                    // Store orderId + the PayGate URL for the return flow (so a
                    // customer who comes back before paying can resume, not restart).
                    try {
                        sessionStorage.setItem("paygate_orderId", data.orderId);
                        sessionStorage.setItem("paygate_paymentUrl", data.paymentUrl);
                    } catch { /* ignore */ }

                    window.location.href = data.paymentUrl;
                    // keep submitting=true — page will navigate away
                } else {
                    setSubmitError(t.errNoPaymentUrl);
                    setSubmitting(false);
                }
            } else if (paymentMethod === "paypal") {
                // ── PayPal (manual payment) — pending page with details ───
                const params = new URLSearchParams({
                    orderId: data.orderId,
                    lang,
                });
                router.push(`/checkout/paypal-pending?${params.toString()}`);
                // keep submitting=true — page will navigate away
            } else if (paymentMethod === "giftcard") {
                // ── Gift card (manual card payment) — pending page + code field ──
                const params = new URLSearchParams({
                    orderId: data.orderId,
                    lang,
                });
                router.push(`/checkout/giftcard-pending?${params.toString()}`);
                // keep submitting=true — page will navigate away
            }
        } catch (err) {
            console.error("Order submission error:", err);
            setSubmitError(t.errUnexpected);
            setSubmitting(false);
        }
    };

    const stepLabels = [t.steps.personal, t.steps.device, t.steps.payment, t.steps.processing, t.steps.confirmation];

    return (
        <div dir={rtl ? "rtl" : "ltr"} lang={lang} style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <CheckoutHeader
                backHref={backHref}
                logoUrl={brand?.logoUrl}
                brandName={brand?.name}
                backLabel={t.back}
                secureLabel={t.secureCheckout}
            />

            <main
                className="checkout-main"
                style={{ flex: 1, maxWidth: "1100px", width: "100%", margin: "0 auto", padding: "40px 24px" }}
            >
                {/* Step Indicator */}
                <div style={{ marginBottom: "40px" }} className="checkout-step-bar">
                    <UnifiedStepIndicator currentStep={currentStep} labels={stepLabels} />
                </div>

                {/* Requested plan not offered by this brand — priced fallback shown */}
                {planMissing && (
                    <div
                        style={{
                            marginBottom: "24px",
                            padding: "10px 14px",
                            background: "var(--accent-muted)",
                            border: "1px solid var(--accent-border)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "12.5px",
                            color: "var(--text-secondary)",
                        }}
                    >
                        {t.planFallbackNotice}
                    </div>
                )}

                {/* Content Area */}
                <div
                    style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "32px", alignItems: "start" }}
                    className="checkout-grid"
                >
                    {/* ── Left: Form ── */}
                    <div
                        className="checkout-form-card"
                        style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-lg)",
                            padding: "32px",
                        }}
                    >
                        {/* Step 1 */}
                        {currentStep === 1 && (
                            <div>
                                <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "6px" }}>{t.step1Title}</h2>
                                <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "28px" }}>
                                    {t.step1Subtitle}
                                </p>
                                <div style={{ display: "grid", gap: "20px" }}>
                                    <FormInput label={t.fullName} value={fullName} onChange={setFullName} placeholder="John Doe" required error={fieldErrors.fullName} maxLength={LIMITS.nameMax} />
                                    <FormInput label={t.emailLabel} type="email" value={email} onChange={setEmail} placeholder="john@example.com" required error={fieldErrors.email} maxLength={LIMITS.emailMax} />
                                    <FormSelect label={t.countryLabel} value={country} onChange={setCountry} options={countryOptions} required placeholder={t.countryPlaceholder} error={fieldErrors.country} />
                                    <FormInput label={t.phoneLabel} type="tel" value={phone} onChange={setPhone} placeholder="123 456 7890" prefix={phoneCode || "+?"} required error={fieldErrors.phone} maxLength={LIMITS.phoneDigitsMax + 5} />
                                </div>
                            </div>
                        )}

                        {/* Step 2 */}
                        {currentStep === 2 && (
                            <div>
                                <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "6px" }}>{t.step2Title}</h2>
                                <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "28px" }}>
                                    {t.step2Subtitle}
                                </p>
                                <div style={{ display: "grid", gap: "20px" }}>
                                    <FormSelect
                                        label={t.deviceTypeLabel}
                                        value={deviceInfo}
                                        onChange={setDeviceInfo}
                                        placeholder={t.devicePlaceholder}
                                        options={[
                                            { value: "Amazon Firestick / Fire TV", label: "Amazon Firestick / Fire TV" },
                                            { value: "Smart TV Samsung", label: "Smart TV Samsung" },
                                            { value: "Smart TV LG", label: "Smart TV LG" },
                                            { value: "Apple TV", label: "Apple TV" },
                                            { value: "Android Phone / Tablet", label: "Android Phone / Tablet" },
                                            { value: "Windows", label: "Windows" },
                                            { value: "iPhone / iPad (iOS)", label: "iPhone / iPad (iOS)" },
                                            { value: "macOS", label: "macOS" },
                                            { value: "Google TV", label: "Google TV" },
                                            { value: "MAG BOX", label: "MAG BOX" },
                                            { value: "Formuler", label: "Formuler" },
                                            { value: "Nvidia Shield", label: "Nvidia Shield" },
                                            { value: "ChromeOS", label: "ChromeOS" },
                                            { value: "Roku", label: "Roku" },
                                            { value: "Other", label: "Other" },
                                        ]}
                                    />
                                    <div style={{ marginTop: "8px" }}>
                                        <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "12px" }}>
                                            {t.hasPlayerQuestion}
                                        </label>
                                        <div style={{ display: "grid", gap: "10px" }}>
                                            <RadioOption
                                                label={t.hasPlayerYes}
                                                description={t.hasPlayerYesDesc}
                                                selected={hasPlayer === "yes"}
                                                onSelect={() => setHasPlayer("yes")}
                                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                                            />
                                            <RadioOption
                                                label={t.hasPlayerNo}
                                                description={t.hasPlayerNoDesc}
                                                selected={hasPlayer === "no"}
                                                onSelect={() => setHasPlayer("no")}
                                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3 — renders only ACTIVE (enabled) payment methods from config.
                            The captcha (when enabled for this site) comes FIRST: payment
                            options stay locked until verification completes. */}
                        {currentStep === 3 && (
                            <div>
                                <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "6px" }}>{t.step3Title}</h2>
                                <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "28px" }}>
                                    {t.step3Subtitle}
                                </p>
                                {captchaActive && challenge?.siteKey && (
                                    <div
                                        style={{
                                            marginBottom: "24px",
                                            padding: "18px 16px",
                                            background: "var(--bg-tertiary)",
                                            border: captchaToken ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                                            borderRadius: "var(--radius-sm)",
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: "12px",
                                        }}
                                    >
                                        <p style={{ fontSize: "12px", color: captchaToken ? "var(--accent)" : "var(--text-secondary)", fontWeight: 500 }}>
                                            {captchaToken ? t.captchaDone : t.captchaPrompt}
                                        </p>
                                        <TurnstileWidget siteKey={challenge.siteKey} onVerify={setCaptchaToken} />
                                    </div>
                                )}
                                <div
                                    style={{
                                        display: "grid",
                                        gap: "12px",
                                        opacity: (captchaActive && !captchaToken) ? 0.45 : 1,
                                        pointerEvents: (captchaActive && !captchaToken) ? "none" : "auto",
                                        transition: "opacity var(--transition)",
                                    }}
                                    aria-disabled={Boolean(captchaActive && !captchaToken)}
                                >
                                    {challengeError && <p role="alert">{challengeError} <button type="button" onClick={() => void fetchChallenge()}>Retry secure checkout</button></p>}
                                    {methodsLoading && <p role="status">Loading available payment methods…</p>}
                                    {methodsError && <p role="alert">{methodsError} <button type="button" onClick={() => void fetchMethodPrices()}>Retry</button></p>}
                                    {!methodsLoading && !methodsError && methodPrices && !Object.values(allowedMethods).some(Boolean) && <p>No payment methods are currently available. Please contact support.</p>}
                                    {activePaymentMethods
                                        .filter((method) => !methodsLoading && !methodsError && allowedMethods[method.id] === true)
                                        .map((method) => {
                                        // A discount on this method earns the badge slot — it is the
                                        // reason to pick this rail, so it outranks the static one.
                                        const saving = methodPrices?.[method.id]?.off ?? 0;
                                        const badge = saving > 0
                                            ? `${t.save} ${formatMoney(saving, currency)}`
                                            : method.badge ? (t.pmBadges[method.id] ?? method.badge) : undefined;
                                        return (
                                            <PaymentMethodCard
                                                key={method.id}
                                                id={method.id}
                                                name={t.pmNames[method.id] ?? method.name}
                                                description={t.pmDescs[method.id] ?? method.description}
                                                icon={PAYMENT_ICONS[method.id]}
                                                selected={paymentMethod === method.id}
                                                onSelect={() => setPaymentMethod(method.id)}
                                                badge={badge}
                                                subIcons={PAYMENT_SUB_ICONS[method.id]}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Navigation */}
                        <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px" }}>
                            {/* Error message — always above the buttons */}
                            {submitError && (
                                <p style={{ fontSize: "12px", color: "var(--error)", textAlign: "center", padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(239,68,68,0.2)" }}>
                                    {submitError}
                                </p>
                            )}
                            {/* Back / Continue buttons */}
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                {currentStep > 1 ? (
                                    <button
                                        onClick={prevStep}
                                        style={{ padding: "12px 24px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer", transition: "all var(--transition)", fontFamily: "var(--font-sans)" }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                                    >
                                        {t.btnBack}
                                    </button>
                                ) : <div />}

                                {(() => {
                                    const preparingOrder = currentStep === 3 && preparing;
                                    const busy = submitting || preparingOrder || (currentStep === 3 && methodsLoading);
                                    return (
                                <button
                                    onClick={currentStep < 3 ? nextStep : handleCompleteOrder}
                                    disabled={busy}
                                    className="nav-btn-continue"
                                    style={{ padding: "12px 32px", borderRadius: "var(--radius-sm)", border: "none", background: busy ? "var(--text-muted)" : "var(--accent)", color: "var(--on-accent)", fontSize: "13px", fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", transition: "all var(--transition)", fontFamily: "var(--font-sans)", opacity: busy ? 0.7 : 1 }}
                                    onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = "var(--accent-hover)"; }}
                                    onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = "var(--accent)"; }}
                                >
                                    {submitting ? t.btnProcessing : preparingOrder ? t.btnProcessing : currentStep === 3 ? t.btnComplete : t.btnContinue}
                                </button>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* ── Right: Order Summary ── */}
                    <div
                        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "28px", position: "sticky", top: "24px" }}
                        className="order-summary checkout-summary-card"
                    >
                        <h3 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "20px" }}>
                            {t.orderSummary}
                        </h3>

                        {/* Plan info */}
                        <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", marginBottom: "16px" }}>
                            <div style={{ width: "40px", height: "40px", borderRadius: "var(--radius-sm)", background: "var(--accent-muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            </div>
                            <div>
                                <p style={{ fontSize: "14px", fontWeight: 500 }}>{t.planLine.replace("{name}", plan.name)}</p>
                                <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{durationLabel(plan.months, plan.duration, t)}</p>
                            </div>
                        </div>

                        {/* Connections badge */}
                        <div
                            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", marginBottom: "16px" }}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                <line x1="8" y1="21" x2="16" y2="21" />
                                <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                <span style={{ color: "var(--accent)", fontWeight: 600 }}>{connections}</span>
                                {" "}{connections === 1 ? t.connection : t.connections}
                            </span>
                        </div>

                        {/* Price breakdown */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{t.subscription}</span>
                                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{formatMoney(totalBefore, currency)}</span>
                            </div>
                            {totalOff > 0 && (
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{t.discount}</span>
                                    <span style={{ fontSize: "13px", color: "var(--success)" }}>−{formatMoney(totalOff, currency)}</span>
                                </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{t.setupFee}</span>
                                <span style={{ fontSize: "13px", color: "var(--success)" }}>{t.free}</span>
                            </div>
                        </div>

                        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "14px", fontWeight: 500 }}>{t.total}</span>
                            <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--accent)" }}>{formatMoney(total, currency)}</span>
                        </div>

                        {/* Trust signals — single row */}
                        <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "row", flexWrap: "wrap", gap: "6px 14px", justifyContent: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{t.trustSsl}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{t.trustInstant}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{t.trustSupport}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <CheckoutFooter
                brandName={brand?.name}
                rightsTemplate={t.footerRights}
                supportLinks={supportLinks}
            />


            {/* Responsive styles */}
            <style>{`
        @media (max-width: 900px) {
          .checkout-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
          .order-summary { position: static !important; order: -1; }
        }
        @media (max-width: 480px) {
          .checkout-main { padding: 20px 16px !important; }
          .checkout-form-card { padding: 20px 16px !important; border-radius: 12px !important; }
          .checkout-summary-card { padding: 18px 16px !important; border-radius: 12px !important; }
          .checkout-step-bar { margin-bottom: 24px !important; }
          .nav-btn-continue { flex: 1; }
        }
        @media (max-width: 360px) {
          .checkout-main { padding: 16px 12px !important; }
          .checkout-form-card { padding: 16px 12px !important; }
        }
      `}</style>
        </div>
    );
}

export default function CheckoutClient(props: CheckoutContentProps) {
    return (
        <Suspense
            fallback={
                <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <p style={{ color: "var(--text-tertiary)" }}>Loading checkout...</p>
                </div>
            }
        >
            <CheckoutContent {...props} />
        </Suspense>
    );
}
