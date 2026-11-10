/**
 * POST /api/checkout/pricing
 *
 * Everything the payment step needs, decided on the server: what each method
 * costs, and which methods this particular customer may be offered at all.
 *
 * It exists because the checkout is a single client component whose props
 * freeze at first render. Two things are only knowable later: a discount edited
 * mid-session, and — more importantly — who the customer is. The method list is
 * built when the page loads, BEFORE any contact details are typed, so it cannot
 * possibly account for a rule about the customer's country or WhatsApp. This
 * runs on every arrival at step 3, when those details exist.
 *
 * The response carries verdicts and final numbers only. It never says WHY a
 * method was withheld — a visitor who learned it was "the country" would just
 * change the country.
 *
 * Body: { planId, connections, phone?, phoneCode?, email?, country? }. The brand
 * comes from the Host header and the IP country from Cloudflare, because both
 * must be beyond the caller's control.
 */
import { paymentEligibility } from "@/app/lib/payment-eligibility";
import { NextRequest, NextResponse } from "next/server";
import { getSitePlans, getGiftcardPurchaseUrl } from "@/app/lib/plans.server";
import { readJsonCapped } from "@/app/lib/customer-input";
import { PAYMENT_METHODS } from "@/app/config/paymentMethods";
import { giftcardAvailable } from "@/app/lib/giftcard-backend";

/** Brand from Host, matching the create routes (checkout.brand.tld → brand.tld). */
function siteFromHost(host: string | null): string {
  if (!host) return process.env.SITE_HOSTNAME || "default";
  const h = host.split(":")[0].toLowerCase();
  return h.startsWith("checkout.") ? h.slice("checkout.".length) : h;
}

export interface MethodPrice {
  /** What the customer pays with this method. */
  price: number;
  /** Pre-discount price; equal to `price` when nothing was taken off. */
  original: number;
  /** Amount saved by choosing this method; 0 when there is no discount. */
  off: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonCapped(req);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const { planId, connections, phone, email, country } = body as {
      planId?: string; connections?: number | string;
      phone?: string; phoneCode?: string; email?: string; country?: string;
    };
    if (!planId || typeof planId !== "string") {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    const siteName = siteFromHost(req.headers.get("host"));
    const conn = Number(connections);
    if (!Number.isInteger(conn) || conn < 1 || conn > 5) return NextResponse.json({ error: "Invalid connections" }, { status: 400 });

    const supported = PAYMENT_METHODS.filter((m) => m.enabled && m.id !== "card");
    const ids = supported.map((m) => m.id);
    const [{ verdicts, error: verdictError }, entries] = await Promise.all([
      paymentEligibility({ site: siteName, methods: ids, phone, country, email, headers: req.headers }),
      // One resolve per method; independent, so run them together.
      Promise.all(
        supported.map(async (m): Promise<[string, MethodPrice] | null> => {
          const { plans } = await getSitePlans(siteName, conn, m.id);
          const plan = plans.find((p) => p.id === planId);
          if (!plan) return null;
          if (m.id === "giftcard" && !await getGiftcardPurchaseUrl(siteName, planId, conn)) return null;
          if (m.id === "giftcard" && !await giftcardAvailable()) return null;
          return [m.id, { price: plan.price, original: plan.originalPrice, off: plan.amountOff }];
        }),
      ),
    ]);

    const methods = Object.fromEntries(entries.filter((e): e is [string, MethodPrice] => e !== null));
    if (Object.keys(methods).length === 0) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    if (verdictError || !verdicts) {
      return NextResponse.json({ error: "Payment methods are temporarily unavailable. Please retry." }, { status: 503 });
    }
    const allowed = Object.fromEntries(ids.map(id => [id, (verdicts as Record<string, boolean>)[id] === true && !!methods[id]]));

    return NextResponse.json(
      { methods, allowed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("checkout/pricing error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
