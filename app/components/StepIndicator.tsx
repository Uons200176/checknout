"use client";

import React from "react";

interface StepIndicatorProps {
    currentStep: number;
    steps: string[];
}

export default function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "0", width: "100%" }}>
            {steps.map((label, index) => {
                const stepNum = index + 1;
                const isActive = stepNum === currentStep;
                const isCompleted = stepNum < currentStep;

                return (
                    <React.Fragment key={index}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: index < steps.length - 1 ? 1 : "none" }}>
                            {/* Step circle */}
                            <div
                                style={{
                                    width: "36px",
                                    height: "36px",
                                    borderRadius: "50%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    flexShrink: 0,
                                    transition: "all var(--transition)",
                                    background: isCompleted
                                        ? "var(--accent)"
                                        : isActive
                                            ? "var(--accent-muted)"
                                            : "var(--bg-tertiary)",
                                    color: isCompleted
                                        ? "var(--bg-primary)"
                                        : isActive
                                            ? "var(--accent)"
                                            : "var(--text-tertiary)",
                                    border: isActive
                                        ? "1.5px solid var(--accent)"
                                        : "1.5px solid transparent",
                                }}
                            >
                                {isCompleted ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
                                    stepNum
                                )}
                            </div>

                            {/* Label */}
                            <span
                                style={{
                                    fontSize: "13px",
                                    fontWeight: isActive ? 500 : 400,
                                    color: isActive
                                        ? "var(--text-primary)"
                                        : isCompleted
                                            ? "var(--accent)"
                                            : "var(--text-tertiary)",
                                    whiteSpace: "nowrap",
                                    transition: "color var(--transition)",
                                }}
                            >
                                {label}
                            </span>

                            {/* Connector line */}
                            {index < steps.length - 1 && (
                                <div
                                    style={{
                                        flex: 1,
                                        height: "1px",
                                        background: isCompleted
                                            ? "var(--accent)"
                                            : "var(--border)",
                                        marginLeft: "12px",
                                        transition: "background var(--transition)",
                                    }}
                                />
                            )}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
}
