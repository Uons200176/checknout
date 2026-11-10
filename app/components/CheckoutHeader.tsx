"use client";

import { useRouter } from "next/navigation";

interface CheckoutHeaderProps {
    /** Where "Back" should go — resolved server-side from the request's Host header. */
    backHref?: string;
    /** Brand logo (site_settings.logo_url) — omitted when the site has none. */
    logoUrl?: string;
    /** Brand display name (site_settings.display_name). */
    brandName?: string;
    /** Localized labels. */
    backLabel?: string;
    secureLabel?: string;
}

export default function CheckoutHeader({
    backHref,
    logoUrl,
    brandName,
    backLabel = "Back",
    secureLabel = "Secure Checkout",
}: CheckoutHeaderProps) {
    const router = useRouter();

    const handleBack = () => {
        if (backHref) {
            window.location.href = backHref;
        } else {
            router.back();
        }
    };

    return (
        <header
            style={{
                padding: "20px 0",
                borderBottom: "1px solid var(--border)",
            }}
        >
            <div
                style={{
                    maxWidth: "1100px",
                    margin: "0 auto",
                    padding: "0 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                }}
            >
                <button
                    onClick={handleBack}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        background: "transparent",
                        border: "none",
                        color: "var(--text-secondary)",
                        fontSize: "14px",
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "8px 12px 8px 0",
                        transition: "color var(--transition)",
                        fontFamily: "var(--font-sans)",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    {backLabel}
                </button>

                {/* Brand identity — logo and/or name from site_settings */}
                {(logoUrl || brandName) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        {logoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={logoUrl}
                                alt={brandName || "Logo"}
                                style={{ height: "30px", width: "auto", maxWidth: "140px", objectFit: "contain", display: "block" }}
                            />
                        )}
                        {brandName && (
                            <span
                                style={{
                                    fontSize: "15px",
                                    fontWeight: 700,
                                    color: "var(--text-primary)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {brandName}
                            </span>
                        )}
                    </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{secureLabel}</span>
                </div>
            </div>
        </header>
    );
}
