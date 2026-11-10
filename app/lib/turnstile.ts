import { cfg } from "./runtime-config";
/**
 * Cloudflare Turnstile server-side verification.
 *
 * Gates the checkout's order-creation endpoints against scripted abuse.
 * Requires TURNSTILE_SITE_KEY (public, used by the widget) and
 * TURNSTILE_SECRET_KEY (server-only, used here) — created via the
 * Cloudflare dashboard → Turnstile → Add Site.
 *
 * Fails OPEN (allows the request, with a logged warning) if
 * TURNSTILE_SECRET_KEY isn't configured yet, so an unfinished Turnstile
 * setup can't accidentally block real orders. Once verified working in
 * production, this can be changed to fail closed if desired.
 *
 * ⚠️  SERVER-ONLY — never import from client components.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
    token: string | null | undefined,
    remoteIp?: string
): Promise<boolean> {
    const secret = await cfg("TURNSTILE_SECRET_KEY");

    if (!secret) {
        console.warn(
            "TURNSTILE_SECRET_KEY is not set — Turnstile verification skipped (failing open). " +
            "Set it in your environment to enable bot protection on checkout."
        );
        return true;
    }

    if (!token) {
        return false;
    }

    try {
        const body = new URLSearchParams({ secret, response: token });
        if (remoteIp) body.set("remoteip", remoteIp);

        const res = await fetch(VERIFY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });

        if (!res.ok) {
            console.error("Turnstile verify request failed:", res.status);
            return false;
        }

        const data = await res.json();
        return Boolean(data.success);
    } catch (err) {
        console.error("Turnstile verify error:", err);
        return false;
    }
}
