"use client";

import { useEffect, useRef, useState } from "react";

interface TurnstileRenderOptions {
    sitekey: string;
    callback: (token: string) => void;
    "expired-callback"?: () => void;
    "error-callback"?: (code?: string) => void;
    "timeout-callback"?: () => void;
    theme?: "light" | "dark" | "auto";
    retry?: "auto" | "never";
}

interface TurnstileGlobal {
    render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string;
    remove: (widgetId: string) => void;
    reset: (widgetId: string) => void;
}

declare global {
    interface Window {
        turnstile?: TurnstileGlobal;
    }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
    if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
    if (scriptLoadPromise) return scriptLoadPromise;

    scriptLoadPromise = new Promise((resolve, reject) => {
        const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (existing) {
            if (window.turnstile) return resolve();
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () => reject(new Error("Turnstile script error")));
            return;
        }
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Turnstile script"));
        document.head.appendChild(script);
    });

    return scriptLoadPromise;
}

interface TurnstileWidgetProps {
    siteKey: string;
    onVerify: (token: string) => void;
}

/** Renders the Cloudflare Turnstile challenge widget. Skips rendering if no siteKey is configured. */
export default function TurnstileWidget({ siteKey, onVerify }: TurnstileWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    // Only true when the *script itself* can't load (network / ad-blocker) — NOT
    // for challenge errors, which Turnstile recovers from on its own via retry.
    const [scriptFailed, setScriptFailed] = useState(false);

    useEffect(() => {
        if (!siteKey) return;
        let cancelled = false;

        loadTurnstileScript()
            .then(() => {
                if (cancelled || !containerRef.current || !window.turnstile) return;
                // Guard against double-render (React StrictMode runs effects twice in dev,
                // and a stray re-run must not stack a second widget on the same node).
                if (widgetIdRef.current !== null || containerRef.current.childElementCount > 0) return;

                widgetIdRef.current = window.turnstile.render(containerRef.current, {
                    sitekey: siteKey,
                    callback: (token: string) => onVerify(token),
                    "expired-callback": () => onVerify(""),
                    // Log the real error code (e.g. 110200 = domain not allowed,
                    // 110100 = invalid sitekey) but let Turnstile handle its own
                    // retry UI instead of tearing the widget down.
                    "error-callback": (code?: string) => {
                        console.error("Turnstile error-callback, code:", code);
                    },
                    theme: document.documentElement.dataset.checkoutTheme === "light" ? "light" : "dark",
                    retry: "auto",
                });
            })
            .catch(() => {
                if (!cancelled) setScriptFailed(true);
            });

        return () => {
            cancelled = true;
            if (widgetIdRef.current !== null && window.turnstile) {
                try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
                widgetIdRef.current = null;
            }
        };
        // onVerify is a stable state setter from the parent — safe to omit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteKey]);

    if (!siteKey) return null;

    if (scriptFailed) {
        return (
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                Could not load the verification widget. Please disable any ad-blocker and refresh.
            </p>
        );
    }

    return <div ref={containerRef} />;
}
