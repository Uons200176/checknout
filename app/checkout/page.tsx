import { headers } from "next/headers";
import { getSiteConfigForRequest } from "../lib/site";
import { PAYMENT_METHODS } from "../config/paymentMethods";
import { getSitePlans } from "../lib/plans.server";
import { normalizeCurrency } from "../lib/currency";
import { getDict, resolveLang } from "../lib/i18n";
import CheckoutClient from "./CheckoutClient";

interface CheckoutPageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
    const headersList = await headers();
    const sp = await searchParams;

    const { site, config } = await getSiteConfigForRequest(headersList.get("host"));
    const backHref = site ? `https://${site}` : undefined;
    // Every method the code knows. Which of them a customer is actually offered
    // is decided ONE place: payment_method_rules, applied per customer at step
    // 3. site_settings.payment_methods_enabled used to filter here first, so a
    // method hidden there never reached the rules at all — two switches for one
    // decision, and the older one silently won.
    const activePaymentMethods = PAYMENT_METHODS;

    // Per-brand plan catalogue (site_plans table → 'Default' rows → code fallback).
    const rawConnections = Array.isArray(sp.connections) ? sp.connections[0] : sp.connections;
    const connections = Math.min(5, Math.max(1, parseInt(rawConnections || "1", 10) || 1));
    const { plans } = await getSitePlans(config.site_name || site, connections);

    if (plans.length === 0) {
        return <main style={{ padding: 40 }}><h1>Checkout temporarily unavailable</h1><p>We could not load the current prices. Please refresh or contact support.</p></main>;
    }

    // Flag when the requested plan doesn't exist for this brand, so the
    // client can show a notice instead of silently swapping the price.
    const requestedPlanId = Array.isArray(sp.plan) ? sp.plan[0] : sp.plan;
    const planMissing = !!requestedPlanId && !plans.some((p) => p.id === requestedPlanId);

    // Language: ?lang= override → site default → English.
    const lang = resolveLang(config.default_language, sp.lang);
    const dict = getDict(lang);

    // Anti-abuse (PoW + captcha) is fully driven by /api/payments/challenge on
    // the client — the DB `create_order` RPC is the sole authority for whether a
    // captcha is required, so there is no page-level captcha decision here.

    return (
        <CheckoutClient
            backHref={backHref}
            activePaymentMethods={activePaymentMethods}
            plans={plans}
            planMissing={planMissing}
            currency={normalizeCurrency(config.currency)}
            lang={lang}
            dict={dict}
            brand={{
                name: config.display_name || undefined,
                logoUrl: config.logo_url || undefined,
            }}
            supportLinks={{
                whatsapp: config.support_whatsapp_link,
                telegram: config.support_telegram_link,
                email: config.support_email,
            }}
        />
    );
}
