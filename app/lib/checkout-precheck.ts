import { checkoutRpc } from "./checkout-rpc";
import { cfg } from "./runtime-config";

/** Resolve eligibility before showing payment methods; never expose probe details. */
export async function ensureCheckoutPrecheck(site: string, number: string | null, ip: string | null) {
  if (!number) return;
  const BACKEND_TIMEOUT_MS = 5_000;
    // Is a fresh answer already on file? Also where the feature can be switched
    // off per site. Only KNOWN answers are cached — an "unknown" is retried,
    // since the WhatsApp session may have reconnected since.
    const { data: gate } = await checkoutRpc("precheck_cached", {
      p_site: site, p_phone: number,
    });
    if (gate?.skip || gate?.cached) return;

    const backendUrl = (await cfg("BACKEND_URL")).replace(/\/+$/, "");
    const key = await cfg("GATEWAY_API_KEY");
    if (!backendUrl || !key) return;

    let hasWhatsapp: boolean | null = null;
    let jid: string | null = null;
    let lastError: string | null = null;
    try {
      const res = await fetch(`${backendUrl}/gateway/whatsapp-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gateway-key": key },
        body: JSON.stringify({ phone: number }),
        cache: "no-store",
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      });
      if (res.ok) {
        const d = await res.json();
        // `exists:false` WITH an error means "could not tell", not "no WhatsApp".
        // Collapsing the two would brand every customer during a session outage.
        if (d?.error) lastError = String(d.error);
        else { hasWhatsapp = d?.exists === true; jid = d?.jid ?? null; }
      } else {
        lastError = `backend ${res.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "backend unreachable";
    }

    await checkoutRpc("precheck_record", {
      p_site: site, p_phone: number, p_has_whatsapp: hasWhatsapp,
      p_jid: jid, p_error: lastError, p_ip: ip,
    });

}
