/**
 * POST /api/payments/card/create
 *
 * Anti-abuse: requires a solved PoW token from /api/payments/challenge. Writes
 * the order ONLY through the gated `create_order` RPC (anon key, no service_role),
 * then creates a PayGate wallet session. Returns { paymentUrl }.
 */
import { paymentEligibility } from "@/app/lib/payment-eligibility";
import { NextRequest, NextResponse } from "next/server";
import { validateCustomer, readJsonCapped } from "@/app/lib/customer-input";
import { createPaygateWallet,  buildIpnCallbackUrl } from "@/app/lib/paygate";
import { getSitePlanById } from "@/app/lib/plans.server";
import { normalizeCurrency } from "@/app/lib/currency";
import { verifyTurnstileToken } from "@/app/lib/turnstile";
import { createOrder, updateOrderReference, applyOrderStatus, captchaClearance } from "@/app/lib/orders.rpc";

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
function siteFromHost(host: string | null): string {
  if (!host) return process.env.SITE_HOSTNAME || "default";
  const h = host.split(":")[0].toLowerCase();
  return h.startsWith("checkout.") ? h.slice("checkout.".length) : h;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);
    // Capped read: an oversized body is refused before it is ever parsed.
    const body = await readJsonCapped(req);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const { token, nonce, captchaToken } = body as {
      token?: string; nonce?: string; captchaToken?: string;
    };
    if (!token || !nonce) {
      return NextResponse.json({ error: "Missing security token. Please refresh." }, { status: 400 });
    }

    const { planId, connections, hasPlayer } = body as {
      planId?: string; connections?: number | string; hasPlayer?: string;
    };
    if (!planId || !connections) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Length and format are enforced HERE, not in the form. The form can be
    // bypassed by posting straight to this route.
    const checked = validateCustomer(body);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const { customerName, customerEmail, customerPhone, customerCountry, deviceType } = checked.value;

    let clearance: string | null = null;
    if (captchaToken) {
      const ok = await verifyTurnstileToken(captchaToken, ip);
      if (!ok) return NextResponse.json({ error: "Verification failed, please try again" }, { status: 400 });
      clearance = await captchaClearance(token);
    }

    const siteName = siteFromHost(req.headers.get("host"));
    const currency = normalizeCurrency(undefined);
    const conn = Number(connections);
    if (!Number.isInteger(conn) || conn < 1 || conn > 5) {
      return NextResponse.json({ error: "Connections must be between 1 and 5." }, { status: 400 });
    }
    const plan = await getSitePlanById(siteName, planId, conn, "card-crypto");
    if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });


    // The real gate. The browser was told not to show this method, but a request
    // can be sent without a browser, so the same rule is evaluated again here.
    // cf-ipcountry comes from Cloudflare and overwrites anything the caller sent.
    const { verdicts, identity, ipCountry } = await paymentEligibility({
      site: siteName, methods: ["card-crypto"], phone: customerPhone, country: customerCountry,
      email: customerEmail, headers: req.headers,
    });
    if ((verdicts as Record<string, boolean> | null)?.["card-crypto"] !== true) {
      return NextResponse.json(
        { error: "This payment method is not available for your account." },
        { status: 403 },
      );
    }

    const { order, error: createErr } = await createOrder({
      token, nonce, captchaClearance: clearance,
      order: {
        site_name: siteName,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        // International form, so the DB can find the WhatsApp answer the
        // precheck stored. Read for the rule check only; not a column.
        customer_phone_key: identity.phoneKey,
        customer_phone_country: identity.phoneCountry,
        customer_ip_country: ipCountry,
        customer_country: customerCountry || null,
        plan_id: plan.id, plan_name: plan.name, plan_duration: plan.duration, plan_price: plan.price,
        connections: conn, device_type: deviceType || null,
        has_iptv_player: hasPlayer === "yes" ? true : hasPlayer === "no" ? false : null,
        payment_method: "card-crypto", status: "awaiting_payment",
      },
    });

    if (createErr || !order) {
      const msg = createErr || "";
      if (msg.includes("invalid_or_used_token")) return NextResponse.json({ error: "Your session expired. Please refresh and try again." }, { status: 409 });
      if (msg.includes("pow_failed")) return NextResponse.json({ error: "Verification failed. Please refresh and try again." }, { status: 400 });
      if (msg.includes("method_not_allowed")) return NextResponse.json({ error: "This payment method is not available for your account." }, { status: 403 });
      if (msg.includes("invalid_plan")) return NextResponse.json({ error: "That plan is not available. Please pick another." }, { status: 400 });
      if (msg.includes("captcha_required")) return NextResponse.json({ error: "Please complete the verification and retry." }, { status: 400 });
      console.error("create_order failed:", createErr);
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    // Embed order_number in the callback so the PayGate webhook can key on it.
    // Roll back on BOTH failure modes: createPaygateWallet REJECTS (PayGate 4xx/5xx,
    // timeout) or RESOLVES without an address_in.
    let wallet;
    try {
      wallet = await createPaygateWallet(await buildIpnCallbackUrl(String(order.order_number)));
    } catch (walletErr) {
      await applyOrderStatus(order.order_number, "cancelled");
      console.error("PayGate wallet creation threw:", walletErr);
      return NextResponse.json({ error: "Failed to create payment session" }, { status: 502 });
    }
    if (!wallet.address_in) {
      await applyOrderStatus(order.order_number, "cancelled");
      console.error("PayGate wallet creation failed:", wallet);
      return NextResponse.json({ error: "Failed to create payment session" }, { status: 502 });
    }

    // payment_reference stored as a proper jsonb object (not a string).
    const referenceError = await updateOrderReference(order.order_number, {
      price_amount: order.plan_price,
      price_currency: currency,
      ipn_token: wallet.ipn_token,
      address_in: wallet.address_in,
      polygon_address_in: wallet.polygon_address_in,
    });

    if (referenceError) {
      console.error("Wallet reference persistence failed");
      return NextResponse.json({ error: "Payment session could not be saved. Please contact support.", orderId: order.id }, { status: 503 });
    }

    const paymentUrl = `/api/payments/card/redirect?orderId=${encodeURIComponent(order.id)}`;

    return NextResponse.json({ orderId: order.id, orderNumber: order.order_number, paymentUrl });
  } catch (err) {
    console.error("Card payment create error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
