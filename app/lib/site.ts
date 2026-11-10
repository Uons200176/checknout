/**
 * Per-brand site resolution.
 *
 * This checkout is a single deployment shared across multiple IPTV brands,
 * each reachable at `checkout.<brand-domain>`. Brand identity is derived
 * strictly from the request's Host header — never from a client-supplied
 * query param — so it can't be lost on refresh and can't be spoofed.
 *
 * Reads the SAFE, public display subset via the anon-key `get_public_site_config`
 * RPC (no service_role). Secrets (Resend/WhatsApp keys, panel URLs) never leave
 * the database — this app no longer holds a service_role key at all.
 *
 * ⚠️  SERVER-ONLY — never import from client components.
 */
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";

const siteDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Display-only config surfaced to the checkout UI. Secret fields are gone;
 *  the Resend sender is now configured via env, not per-site DB rows. */
export interface SiteConfig {
  site_name: string;
  domain: string | null;
  display_name: string | null;
  theme_accent_color: string | null;
  theme_bg_color: string | null;
  payment_methods_enabled: Record<string, boolean> | null;
  support_whatsapp_link: string | null;
  support_telegram_link: string | null;
  support_email: string | null;
  support_phone: string | null;
  /** External URL where the customer buys the prepaid gift card (public, non-secret). */
  giftcard_purchase_url: string | null;
  // Not columns in site_settings today (always null) — kept so the UI can fall
  // back cleanly (no logo, USD, default language). Add columns + expose them in
  // get_public_site_config later to activate per-site values.
  logo_url: string | null;
  currency: string | null;
  default_language: string | null;
}

const EMPTY_SITE_CONFIG: SiteConfig = {
  site_name: "Default",
  domain: null,
  display_name: null,
  theme_accent_color: null,
  theme_bg_color: null,
  payment_methods_enabled: null,
  support_whatsapp_link: null,
  support_telegram_link: null,
  support_email: null,
  support_phone: null,
  giftcard_purchase_url: null,
  logo_url: null,
  currency: null,
  default_language: null,
};

/**
 * Derives the canonical brand/site identifier from a request's Host header.
 * `checkout.epixiptv.tv` → `epixiptv.tv`. Strips port and lowercases.
 */
export function getSiteFromHost(host: string | null | undefined): string {
  if (!host) return "";
  let h = host.trim().toLowerCase().split(":")[0];
  if (h.startsWith("checkout.")) h = h.slice("checkout.".length);
  return h;
}

/**
 * Full resolution for a Host header value: derives the site and fetches the
 * safe display config via the anon RPC (which itself resolves site_name/domain
 * and falls back to the 'Default' brand row). Wrapped in React `cache()` so the
 * layout, page and metadata resolving the same host share a single query.
 */
export const getSiteConfigForRequest = cache(async function getSiteConfigForRequestUncached(
  host: string | null | undefined,
): Promise<{ site: string; config: SiteConfig }> {
  const site = getSiteFromHost(host);
  try {
    const { data } = await siteDb.rpc("get_public_site_config", { p_site_name: site });
    if (!data) return { site, config: { ...EMPTY_SITE_CONFIG, site_name: site || "Default" } };
    return { site, config: { ...EMPTY_SITE_CONFIG, ...(data as Partial<SiteConfig>) } };
  } catch (err) {
    console.error("get_public_site_config failed:", err);
    return { site, config: { ...EMPTY_SITE_CONFIG, site_name: site || "Default" } };
  }
});
