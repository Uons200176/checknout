"use client";

import { useState } from "react";

interface FormSelectProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    required?: boolean;
    placeholder?: string;
    /** Field-level validation message — shown under the select with a red border. */
    error?: string;
}

export default function FormSelect({
    label,
    value,
    onChange,
    options,
    required,
    placeholder,
    error,
}: FormSelectProps) {
    const [focused, setFocused] = useState(false);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label
                style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: focused ? "var(--accent)" : "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    transition: "color var(--transition)",
                }}
            >
                {label}
                {required && <span style={{ color: "var(--accent)", marginLeft: "4px" }}>*</span>}
            </label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{
                    background: "var(--bg-tertiary)",
                    border: error
                        ? "1px solid var(--error)"
                        : focused
                            ? "1px solid var(--accent)"
                            : "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "12px 14px",
                    fontSize: "14px",
                    color: value ? "var(--text-primary)" : "var(--text-tertiary)",
                    fontFamily: "var(--font-sans)",
                    cursor: "pointer",
                    transition: "border-color var(--transition)",
                    outline: "none",
                    appearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236a6a6e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 14px center",
                    paddingRight: "36px",
                }}
            >
                {placeholder && (
                    <option value="" disabled>
                        {placeholder}
                    </option>
                )}
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}>
                        {opt.label}
                    </option>
                ))}
            </select>
            {error && (
                <p style={{ fontSize: "12px", color: "var(--error)", margin: 0 }}>{error}</p>
            )}
        </div>
    );
}
