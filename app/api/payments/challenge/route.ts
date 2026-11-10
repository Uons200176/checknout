import { NextRequest, NextResponse } from "next/server";
import { checkoutRpc } from "@/app/lib/checkout-rpc";
import { cfg } from "@/app/lib/runtime-config";
import { getClientIp } from "@/app/lib/client-ip";

// Best-effort per-IP throttle so a bot can't cheaply pile up challenge tokens.
// This is only a soft anti-farming layer — real abuse is gated downstream by the
// PoW solve + single-use token consumed inside create_order. (Farmed tokens also
// self-expire and are swept hourly by pg_cron.)
const WINDOW_MS = 60 * 1000;
const MAX = 20;
const hits = new Map<string, number[]>();
let lastSweep = 0;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  // Periodic sweep so rotating/spoofed IPs can't grow the map unbounded.
  if (now - lastSweep > WINDOW_MS) {
    for (const [k, v] of hits) {
      const fresh = v.filter((t) => now - t < WINDOW_MS);
      if (fresh.length) hits.set(k, fresh); else hits.delete(k);
    }
    lastSweep = now;
  }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX;
}
// IP derivation lives in one place — see app/lib/client-ip.ts for why only
// proxy-set headers are trusted.

// Issues a Proof-of-Work challenge + one-time token for checkout. The browser
// solves the PoW (and captcha, if required) before it can create an order.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    if (rateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }
    const { data, error } = await checkoutRpc("issue_payment_challenge", {
      p_issued_ip: ip,
      p_captcha_verifiable: !!(await cfg("TURNSTILE_SECRET_KEY")),
    });
    if (error) throw error;
    return NextResponse.json({
      token: data.token,
      difficulty: data.difficulty,
      captchaRequired: data.captcha_required === true,
      siteKey: data.site_key ?? null,
    });
  } catch (err) {
    console.error("Payment challenge error:", err);
    return NextResponse.json({ error: "Could not start checkout. Please refresh and try again." }, { status: 500 });
  }
}
