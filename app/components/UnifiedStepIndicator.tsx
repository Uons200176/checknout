"use client";

import React from "react";

interface UnifiedStepIndicatorProps {
    /** 1-based current active step (1–5) */
    currentStep: number;
    /** Pass 'success' or 'failed' when on Step 5 to show ✓ or ✗ */
    finalState?: "success" | "failed" | null;
    /** Localized step labels (5 items). Defaults to English. */
    labels?: string[];
}

const ALL_STEPS = [
    "Personal Info",
    "Device Info",
    "Payment",
    "Processing",
    "Confirmation",
];

export default function UnifiedStepIndicator({ currentStep, finalState, labels }: UnifiedStepIndicatorProps) {
    const steps = labels && labels.length === ALL_STEPS.length ? labels : ALL_STEPS;
    return (
        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
            {steps.map((label, index) => {
                const stepNum = index + 1;
                const isActive = stepNum === currentStep;
                const isCompleted = stepNum < currentStep;
                const isFinalStep = stepNum === 5;
                const isLast = index === ALL_STEPS.length - 1;

                // Determine icon for step circle
                let circleContent: React.ReactNode = stepNum;
                let circleBg = "var(--bg-tertiary)";
                let circleColor = "var(--text-tertiary)";
                let circleBorder = "1.5px solid var(--border)";

                if (isCompleted && !(isFinalStep)) {
                    // Completed non-final step → green ✓
                    circleContent = (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    );
                    circleBg = "var(--accent)";
                    circleColor = "var(--on-accent)";
                    circleBorder = "1.5px solid transparent";
                } else if (isFinalStep && finalState === "success") {
                    // Final step success → green ✓
                    circleContent = (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    );
                    circleBg = "var(--accent)";
                    circleColor = "var(--on-accent)";
                    circleBorder = "1.5px solid transparent";
                } else if (isFinalStep && finalState === "failed") {
                    // Final step failure → red ✗
                    circleContent = (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    );
                    circleBg = "var(--danger-strong)";
                    circleColor = "#fff";
                    circleBorder = "1.5px solid transparent";
                } else if (isActive) {
                    circleBg = "var(--accent-muted)";
                    circleColor = "var(--accent)";
                    circleBorder = "1.5px solid var(--accent)";
                }

                const connectorFilled = isCompleted;

                return (
                    <React.Fragment key={stepNum}>
                        {/* Step node */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                            {/* Circle */}
                            <div style={{
                                width: "34px", height: "34px", borderRadius: "50%",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "13px", fontWeight: 600, flexShrink: 0,
                                background: circleBg, color: circleColor, border: circleBorder,
                                transition: "all 300ms ease",
                            }}>
                                {circleContent}
                            </div>

                            {/* Label — hidden on mobile for middle steps */}
                            <span
                                className={isActive || isCompleted || isFinalStep ? "si-label-show" : "si-label-hide"}
                                style={{
                                    fontSize: "13px", fontWeight: isActive ? 500 : 400,
                                    color: isActive ? "var(--text-primary)" : isCompleted ? "var(--accent)" : "var(--text-tertiary)",
                                    whiteSpace: "nowrap", transition: "color 300ms ease",
                                }}
                            >
                                {label}
                            </span>
                        </div>

                        {/* Connector line between steps */}
                        {!isLast && (
                            <div style={{
                                flex: 1, height: "1px", minWidth: "12px",
                                background: connectorFilled ? "var(--accent)" : "var(--border)",
                                margin: "0 8px",
                                transition: "background 300ms ease",
                            }} />
                        )}
                    </React.Fragment>
                );
            })}

            {/* Responsive: hide labels on small screens to prevent overflow */}
            <style>{`
                @media (max-width: 600px) {
                    .si-label-hide { display: none !important; }
                    .si-label-show { display: none !important; }
                }
                @media (min-width: 601px) {
                    .si-label-hide { display: inline !important; }
                    .si-label-show { display: inline !important; }
                }
            `}</style>
        </div>
    );
}
