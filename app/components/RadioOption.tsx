"use client";

interface RadioOptionProps {
    label: string;
    description?: string;
    selected: boolean;
    onSelect: () => void;
    icon?: React.ReactNode;
}

export default function RadioOption({ label, description, selected, onSelect, icon }: RadioOptionProps) {
    return (
        <div
            onClick={onSelect}
            style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "16px 18px",
                background: selected ? "var(--accent-muted)" : "var(--bg-tertiary)",
                border: selected ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                transition: "all var(--transition)",
            }}
            onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.borderColor = "var(--border-hover)";
            }}
            onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.borderColor = "var(--border)";
            }}
        >
            {/* Radio dot */}
            <div
                style={{
                    width: "18px",
                    height: "18px",
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
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: "var(--accent)",
                        }}
                    />
                )}
            </div>

            {icon && (
                <div style={{ flexShrink: 0, color: selected ? "var(--accent)" : "var(--text-tertiary)" }}>
                    {icon}
                </div>
            )}

            <div>
                <p style={{ fontSize: "14px", fontWeight: 500, color: selected ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {label}
                </p>
                {description && (
                    <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        {description}
                    </p>
                )}
            </div>
        </div>
    );
}
