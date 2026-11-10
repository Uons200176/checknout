"use client";

interface PaymentMethodCardProps {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    selected: boolean;
    onSelect: () => void;
    badge?: string;
    subIcons?: React.ReactNode[];
}

export default function PaymentMethodCard({
    name,
    description,
    icon,
    selected,
    onSelect,
    badge,
    subIcons,
}: PaymentMethodCardProps) {
    return (
        <div
            onClick={onSelect}
            style={{
                display: "flex",
                flexDirection: "column",
                padding: "20px",
                background: selected ? "var(--accent-muted)" : "var(--bg-tertiary)",
                border: selected ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                transition: "all var(--transition)",
                position: "relative",
                gap: "0",
            }}
            onMouseEnter={(e) => {
                if (!selected) {
                    e.currentTarget.style.borderColor = "var(--border-hover)";
                    e.currentTarget.style.background = "var(--bg-elevated)";
                }
            }}
            onMouseLeave={(e) => {
                if (!selected) {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "var(--bg-tertiary)";
                }
            }}
        >
            {badge && (
                <span
                    style={{
                        position: "absolute",
                        top: "-1px",
                        right: "16px",
                        transform: "translateY(-50%)",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        color: "var(--text-tertiary)",
                        fontSize: "10px",
                        fontWeight: 500,
                        padding: "2px 10px",
                        borderRadius: "10px",
                        letterSpacing: "0.3px",
                    }}
                >
                    {badge}
                </span>
            )}

            {/* Top row: radio + icon + text + arrow */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                {/* Radio indicator */}
                <div
                    style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        border: selected ? "2px solid var(--accent)" : "2px solid var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all var(--transition)",
                    }}
                >
                    {selected && (
                        <div
                            style={{
                                width: "9px",
                                height: "9px",
                                borderRadius: "50%",
                                background: "var(--accent)",
                            }}
                        />
                    )}
                </div>

                {/* Icon */}
                <div
                    style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "var(--radius-sm)",
                        background: selected ? "rgba(201, 169, 110, 0.1)" : "var(--bg-elevated)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all var(--transition)",
                        overflow: "hidden",
                    }}
                >
                    {icon}
                </div>

                {/* Text */}
                <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                        {name}
                    </p>
                    <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        {description}
                    </p>
                </div>

                {/* Arrow */}
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                >
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </div>

            {/* Sub-icons row: shown below description */}
            {subIcons && subIcons.length > 0 && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "12px",
                        paddingLeft: "78px", // align with the text (radio 20 + gap 16 + icon 42)
                        flexWrap: "wrap",
                    }}
                >
                    {subIcons.map((icon, i) => (
                        <div
                            key={i}
                            style={{
                                borderRadius: "4px",
                                overflow: "hidden",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                opacity: 0.85,
                            }}
                        >
                            {icon}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
