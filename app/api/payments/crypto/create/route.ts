/**
 * POST /api/payments/crypto/create
 *
 * Anti-abuse: the browser must first GET a PoW token from /api/payments/challenge,
 * solve it, and send { token, nonce, captchaToken? } here. The order is written
 * ONLY through the PoW/captcha-gated `create_order` RPC (anon key, no service_role).
 * Creates a NOWPayments invoice and returns { invoiceUrl } to redirect to.
 */
import { paymentEligibility } from "@/app/lib/payment-eligibility";
import { parseCheckoutTheme, withCheckoutTheme } from "@/app/lib/checkout-theme";
import { NextRequest, NextResponse } from "next/server";
import { validateCustomer, readJsonCapped } from "@/app/lib/customer-input";
import { createCryptoInvoice } from "@/app/lib/nowpayments";
import { getSitePlanById } from "@/app/lib/plans.server";
import { normalizeCurrency } from "@/app/lib/currency";
import { verifyTurnstileToken } from "@/app/lib/turnstile";
import {
  createOrder,
  updateOrderReference,
  applyOrderStatus,
  captchaClearance,
} from "@/app/lib/orders.rpc";

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// checkout.<brand> → <brand>. The order's site_name is resolved to an existing
// site_settings row inside the RPC (falls back to 'default'), so this is safe.
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

    // If a captcha token is present, verify it and derive the clearance the RPC
    // requires. (The challenge told the client whether captcha was needed.)
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

    // Price authority = the brand's plan catalogue (falls back to the static one).
    const plan = await getSitePlanById(siteName, planId, conn, "crypto");
    if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

    // ── Create the order (PoW + captcha gated, via RPC) ──

    // The real gate. The browser was told not to show this method, but a request
    // can be sent without a browser, so the same rule is evaluated again here.
    // cf-ipcountry comes from Cloudflare and overwrites anything the caller sent.
    const { verdicts, identity, ipCountry } = await paymentEligibility({
      site: siteName, methods: ["crypto"], phone: customerPhone, country: customerCountry,
      email: customerEmail, headers: req.headers,
    });
    if ((verdicts as Record<string, boolean> | null)?.["crypto"] !== true) {
      return NextResponse.json(
        { error: "This payment method is not available for your account." },
        { status: 403 },
      );
    }

    const { order, error: createErr } = await createOrder({
      token,
      nonce,
      captchaClearance: clearance,
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
        plan_id: plan.id,
        plan_name: plan.name,
        plan_duration: plan.duration,
        plan_price: plan.price,
        connections: conn,
        device_type: deviceType || null,
        has_iptv_player: hasPlayer === "yes" ? true : hasPlayer === "no" ? false : null,
        payment_method: "crypto",
        status: "awaiting_payment",
      },
    });

    if (createErr || !order) {
      const msg = createErr || "";
      if (msg.includes("invalid_or_used_token")) {
        return NextResponse.json({ error: "Your session expired. Please refresh and try again." }, { status: 409 });
      }
      if (msg.includes("pow_failed")) {
        return NextResponse.json({ error: "Verification failed. Please refresh and try again." }, { status: 400 });
      }
      if (msg.includes("method_not_allowed")) {
        return NextResponse.json({ error: "This payment method is not available for your account." }, { status: 403 });
      }
      if (msg.includes("invalid_plan")) {
        return NextResponse.json({ error: "That plan is not available. Please pick another." }, { status: 400 });
      }
      if (msg.includes("captcha_required")) {
        return NextResponse.json({ error: "Please complete the verification and retry." }, { status: 400 });
      }
      console.error("create_order failed:", createErr);
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    // ── Create NOWPayments invoice ──
    // Roll the order back to cancelled on BOTH failure modes: the SDK REJECTS
    // (NOWPayments 4xx/5xx, timeout, bad key) or RESOLVES with a falsy id.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const theme = parseCheckoutTheme(req.nextUrl.searchParams.get("theme"));
    let invoice;
    try {
      invoice = await createCryptoInvoice({
        orderNumber: order.order_number,
        priceAmount: order.plan_price,
        priceCurrency: currency,
        ipnCallbackUrl: `${appUrl}/api/webhooks/nowpayments`,
        successUrl: `${appUrl}${withCheckoutTheme(`/checkout/payment-status?orderId=${order.id}&status=success`, theme)}`,
        cancelUrl: `${appUrl}${withCheckoutTheme(`/checkout/payment-status?orderId=${order.id}&status=cancelled`, theme)}`,
      });
    } catch (invErr) {
      await applyOrderStatus(order.order_number, "cancelled");
      console.error("NOWPayments invoice threw:", invErr);
      return NextResponse.json({ error: "Failed to create payment invoice" }, { status: 502 });
    }

    if (!invoice?.id || !invoice.invoice_url?.startsWith("https://")) {
      await applyOrderStatus(order.order_number, "cancelled");
      console.error("NOWPayments invoice failed:", invoice);
      return NextResponse.json({ error: "Failed to create payment invoice" }, { status: 502 });
    }

    // ── Store the invoice reference (jsonb, via clearance-gated RPC) ──
    const referenceError = await updateOrderReference(order.order_number, {
      invoice_id: String(invoice.id), price_amount: order.plan_price, price_currency: currency,
    });
    if (referenceError) {
      console.error("Invoice reference persistence failed");
      return NextResponse.json({ error: "Payment session could not be saved. Please contact support.", orderId: order.id }, { status: 503 });
    }

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.order_number,
      invoiceId: String(invoice.id),
      invoiceUrl: invoice.invoice_url,
    });
  } catch (err) {
    console.error("Crypto payment create error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
