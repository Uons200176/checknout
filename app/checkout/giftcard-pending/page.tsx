import { headers } from "next/headers";
import { getSiteConfigForRequest } from "../../lib/site";
import { getGiftcardPurchaseUrl } from "../../lib/plans.server";
import GiftcardPendingClient from "./GiftcardPendingClient";
import { getOrderPublic } from "../../lib/orders.rpc";


interface GiftcardPendingPageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function GiftcardPendingPage({ searchParams }: GiftcardPendingPageProps) {
    const headersList = await headers();
    const sp = await searchParams;
    const { site, config } = await getSiteConfigForRequest(headersList.get("host"));
    const backHref = site ? `https://${site}` : undefined;

    // Public store link where the customer buys the prepaid gift card, matched to
    // THIS plan's price. Resolution: per-plan link (pricing.giftcard_linkN, keyed
    // by plan + connections) → site-wide default (site_settings.giftcard_purchase_url)
    // → env → null (UI degrades gracefully and points the customer to support).
    const orderId = (Array.isArray(sp.orderId) ? sp.orderId[0] : sp.orderId) || "";
    const order = orderId ? await getOrderPublic(orderId) : null;
    const planId = order?.payment_method === "giftcard" ? String(order.plan_id ?? "") : "";
    const connections = Number(order?.connections) || 1;
    const perPlanLink = planId
        ? await getGiftcardPurchaseUrl(String(order?.site_name || config.site_name || site), planId, connections)
        : null;
    const purchaseUrl =
        perPlanLink;

    const supportLinks = {
        whatsapp: config.support_whatsapp_link || "https://wa.me/message/6CPS42MOC2DHB1",
        telegram: config.support_telegram_link || "https://t.me/iptv_support0",
        email: config.support_email || "support@epixiptv.tv",
    };

    return (
        <GiftcardPendingClient backHref={backHref} supportLinks={supportLinks} purchaseUrl={purchaseUrl} />
    );
}
