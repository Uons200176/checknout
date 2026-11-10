"use client";

interface ConnectionSelectorProps {
    value: number;
    onChange: (n: number) => void;
    min?: number;
    max?: number;
}

export default function ConnectionSelector({
    value,
    onChange,
    min = 1,
    max = 5,
}: ConnectionSelectorProps) {
    const steps = Array.from({ length: max - min + 1 }, (_, i) => i + min);

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            {/* Label */}
            <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Number of Connections
                </p>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                    How many devices will stream simultaneously?
                </p>
            </div>

            {/* Stepper buttons */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "6px",
                }}
            >
                {steps.map((n) => (
                    <button
                        key={n}
                        onClick={() => onChange(n)}
                        style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "var(--radius-sm)",
                            border: n === value ? "1px solid var(--accent-border)" : "1px solid transparent",
                            background: n === value ? "var(--accent-muted)" : "transparent",
                            color: n === value ? "var(--accent)" : "var(--text-tertiary)",
                            fontSize: "16px",
                            fontWeight: n === value ? 700 : 400,
                            cursor: "pointer",
                            transition: "all var(--transition)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "2px",
                            fontFamily: "var(--font-sans)",
                        }}
                        onMouseEnter={(e) => {
                            if (n !== value) {
                                e.currentTarget.style.background = "var(--bg-hover)";
                                e.currentTarget.style.color = "var(--text-secondary)";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (n !== value) {
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.color = "var(--text-tertiary)";
                            }
                        }}
                    >
                        <span>{n}</span>
                        <span style={{ fontSize: "9px", color: "inherit", opacity: 0.7, fontWeight: 400 }}>
                            {n === 1 ? "device" : "devices"}
                        </span>
                    </button>
                ))}
            </div>

            {/* Summary badge */}
            <div
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 14px",
                    background: "var(--accent-muted)",
                    border: "1px solid var(--accent-border)",
                    borderRadius: "20px",
                }}
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span style={{ fontSize: "12px", color: "var(--accent)", fontWeight: 500 }}>
                    {value} {value === 1 ? "Connection" : "Connections"} selected
                </span>
            </div>
        </div>
    );
}
