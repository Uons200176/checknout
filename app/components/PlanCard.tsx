"use client";

import { useCheckoutRouter as useRouter } from "../lib/use-checkout-router";

interface PlanCardProps {
    id: string;
    name: string;
    duration: string;
    price: string;
    perMonth: string;
    features: string[];
    popular?: boolean;
}

export default function PlanCard({ id, name, duration, price, perMonth, features, popular }: PlanCardProps) {
    const router = useRouter();

    return (
        <div
            onClick={() => router.push(`/checkout?plan=${id}`)}
            style={{
                background: popular ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                border: popular ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "32px 28px",
                cursor: "pointer",
                transition: "all var(--transition)",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = popular ? "var(--accent)" : "var(--border-hover)";
                e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = popular ? "rgba(201, 169, 110, 0.3)" : "var(--border)";
                e.currentTarget.style.transform = "translateY(0)";
            }}
        >
            {popular && (
                <div
                    style={{
                        position: "absolute",
                        top: "-1px",
                        left: "50%",
                        transform: "translateX(-50%) translateY(-50%)",
                        background: "var(--accent)",
                        color: "var(--on-accent)",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 16px",
                        borderRadius: "20px",
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                    }}
                >
                    Most Popular
                </div>
            )}

            <div>
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)", fontWeight: 500, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {name}
                </p>
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {duration}
                </p>
            </div>

            <div>
                <span style={{ fontSize: "36px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                    {price}
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-tertiary)", marginLeft: "4px" }}>
                    {perMonth}
                </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
                {features.map((feature, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{feature}</span>
                    </div>
                ))}
            </div>

            <button
                style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: popular ? "none" : "1px solid var(--border)",
                    background: popular ? "var(--accent)" : "transparent",
                    color: popular ? "var(--on-accent)" : "var(--text-secondary)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all var(--transition)",
                }}
                onMouseEnter={(e) => {
                    if (!popular) {
                        e.currentTarget.style.borderColor = "var(--border-hover)";
                        e.currentTarget.style.color = "var(--text-primary)";
                    } else {
                        e.currentTarget.style.background = "var(--accent-hover)";
                    }
                }}
                onMouseLeave={(e) => {
                    if (!popular) {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.color = "var(--text-secondary)";
                    } else {
                        e.currentTarget.style.background = "var(--accent)";
                    }
                }}
            >
                Select Plan
            </button>
        </div>
    );
}
