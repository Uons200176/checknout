/**
 * POST /api/checkout/precheck
 *
 * Silent groundwork done while the customer is still filling in step 1: note
 * their IP, and find out whether their phone number is on WhatsApp. The answer
 * is needed later, at the payment step.
 *
 * THE CUSTOMER MUST NEVER SEE ANY OF THIS. The response is a bare `{ ok: true }`
 * in every case — cached, checked, skipped, refused, backend down, malformed
 * input. No status, no timing tell, no error. From the browser's point of view
 * nothing happened, which is the entire point: a visitor who could tell that we
 * probe their number, or could read the verdict, would know to work around it.
 *
 * Body: { phone, phoneCode? }. Nothing else is read — the brand comes from the
 * Host header and the IP from proxy headers, because both must be beyond the
 * caller's control.
 */
import { NextRequest, NextResponse } from "next/server";
import { paymentIdentity } from "@/app/lib/payment-identity";
import { ensureCheckoutPrecheck } from "@/app/lib/checkout-precheck";
import { getClientIp } from "@/app/lib/client-ip";
import { readJsonCapped, toInternationalPhone } from "@/app/lib/customer-input";


/**
 * Never tell the caller anything. Every path returns exactly this.
 *
 * Built fresh per call, not hoisted to a module constant: a Response body is a
 * single-use stream, so one shared instance would serve the first request and
 * fail every one after it.
 */
const silent = () => NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });

/** Brand from Host, matching the create routes. */
function siteFromHost(host: string | null): string {
  if (!host) return process.env.SITE_HOSTNAME || "default";
  const h = host.split(":")[0].toLowerCase();
  return h.startsWith("checkout.") ? h.slice("checkout.".length) : h;
}




export async function POST(req: NextRequest) {
  try {
    const body = await readJsonCapped(req);
    if (!body) return silent();
    const { phone, phoneCode, country } = body;
    const site = siteFromHost(req.headers.get("host"));
    const number = country ? paymentIdentity(phone, country).phoneKey : toInternationalPhone(phone, phoneCode);
    if (!number) return silent();

    const ip = getClientIp(req.headers);

    await ensureCheckoutPrecheck(site, number, ip);

    return silent();
  } catch (err) {
    // Even a crash tells the customer nothing.
    console.error("checkout/precheck error:", err);
    return silent();
  }
}
