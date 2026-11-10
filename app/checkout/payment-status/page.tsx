import { headers } from "next/headers";
import { getSiteConfigForRequest } from "../../lib/site";
import PaymentStatusClient from "./PaymentStatusClient";

export default async function PaymentStatusPage() {
    const headersList = await headers();
    const { site, config } = await getSiteConfigForRequest(headersList.get("host"));
    const backHref = site ? `https://${site}` : undefined;

    const supportLinks = {
        whatsapp: config.support_whatsapp_link || "https://wa.me/message/6CPS42MOC2DHB1",
        telegram: config.support_telegram_link || "https://t.me/iptv_support0",
        email: config.support_email || "support@epixiptv.tv",
    };

    return <PaymentStatusClient backHref={backHref} supportLinks={supportLinks} />;
}
