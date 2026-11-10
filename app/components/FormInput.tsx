"use client";

import { useState } from "react";

interface FormInputProps {
    label: string;
    type?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    prefix?: string;
    /** Field-level validation message — shown under the input with a red border. */
    error?: string;
    /** Caps what can be typed. Courtesy only — the server enforces the real limit. */
    maxLength?: number;
}

export default function FormInput({
    label,
    type = "text",
    value,
    onChange,
    placeholder,
    required,
    prefix,
    error,
    maxLength,
}: FormInputProps) {
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
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--bg-tertiary)",
                    border: error
                        ? "1px solid var(--error)"
                        : focused
                            ? "1px solid var(--accent)"
                            : "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    transition: "border-color var(--transition)",
                    overflow: "hidden",
                }}
            >
                {prefix && (
                    <span
                        style={{
                            padding: "12px 0 12px 14px",
                            fontSize: "14px",
                            color: "var(--text-tertiary)",
                            whiteSpace: "nowrap",
                            userSelect: "none",
                        }}
                    >
                        {prefix}
                    </span>
                )}
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        padding: prefix ? "12px 14px 12px 6px" : "12px 14px",
                        fontSize: "14px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-sans)",
                    }}
                />
            </div>
            {error && (
                <p style={{ fontSize: "12px", color: "var(--error)", margin: 0 }}>{error}</p>
            )}
        </div>
    );
}
