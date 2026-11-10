/**
 * Per-site plan & pricing resolution — the SERVER-SIDE PRICE AUTHORITY.
 *
 * The price a customer is charged is ALWAYS resolved here, never taken from the
 * client. Resolution order:
 *
 *   1. The `get_site_plan_prices` RPC, which reads the `pricing` table and
 *      applies any payment-method discount. Same table + column layout the
 *      landing-page template reads, so checkout charges what the site advertises:
 *        plan1 → 1 month, plan2 → 3 months, plan3 → 6 months, plan4 → 12 months
 *        each column = number[5] ordered [1..5 connections].
 *      The arithmetic lives in Postgres because `create_order` performs it too;
 *      one implementation means the displayed price and the charged price cannot
 *      drift apart.
 *   2. The code catalogue provides labels only; missing database prices fail closed.
 *
 * Anon can only READ pricing (writes are RLS-blocked), and the discount RULES
 * are never exposed to anon at all — only the resolved numbers — so this stays
 * tamper-proof.
 *
 * ⚠️  SERVER-ONLY — never import from client components.
 */
import { checkoutRpc } from "./checkout-rpc";
import { createClient } from "@supabase/supabase-js";
import { getPlans as getFallbackPlans, type Plan } from "../data/plans";

const pricingDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Plan-id → gift-card link column (parallel to the price columns plan1..plan4).
const GIFTCARD_COLUMN_BY_MONTHS: Record<number, "giftcard_link1" | "giftcard_link2" | "giftcard_link3" | "giftcard_link4"> = {
  1: "giftcard_link1",
  3: "giftcard_link2",
  6: "giftcard_link3",
  12: "giftcard_link4",
};

interface PricingRow {
  site_name: string;
  plan1: number[] | null;
  plan2: number[] | null;
  plan3: number[] | null;
  plan4: number[] | null;
  giftcard_link1: string[] | null;
  giftcard_link2: string[] | null;
  giftcard_link3: string[] | null;
  giftcard_link4: string[] | null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Fetch the per-site pricing row (anon read) — now only for the gift-card link
 *  columns; prices come from the `get_site_plan_prices` RPC. Uses the canonical
 *  site only; missing configuration must not select another site's purchase link. */
async function fetchPricingRow(siteName: string | null | undefined): Promise<PricingRow | null> {
  const { data: siteConfig, error: siteError } = await pricingDb.rpc("get_public_site_config", { p_site_name: siteName ?? "default" });
  if (siteError) throw new Error("Site configuration unavailable");
  const candidates = Array.from(
    new Set([siteConfig?.site_name || siteName].filter(Boolean) as string[]),
  );
  if (candidates.length === 0) return null;
  try {
    const { data, error } = await checkoutRpc("giftcard_links", { p_sites: candidates });
    if (error || !data || data.length === 0) return null;
    // Never borrow a purchase link from another pricing row.
    for (const cand of candidates) {
      const hit = (data as PricingRow[]).find((r) => r.site_name === cand);
      if (hit) return hit;
    }
    return null;
  } catch (err) {
    console.error("pricing fetch threw:", err);
    return null;
  }
}

/** A plan carrying what it cost before any payment-method discount. */
export interface PricedPlan extends Plan {
  /** Pre-discount price. Equal to `price` when nothing was taken off. */
  originalPrice: number;
  /** Fixed amount removed by the payment-method discount; 0 when none. */
  amountOff: number;
}

export interface SitePlansResult {
  plans: PricedPlan[];
  /** "db" when the prices came from `pricing`, "default" for the code catalogue. */
  source: "db" | "default";
}

/** One row of `get_site_plan_prices`. */
interface ResolvedPrice {
  plan_id: string;
  original: number | string;
  amount_off: number | string;
  final: number | string;
}

function withPrice(p: Plan, price: number, originalPrice: number, amountOff: number): PricedPlan {
  const perMonth =
    p.months === 1 ? `$${price.toFixed(2)}/mo` : `~$${round2(price / (p.months || 1)).toFixed(2)}/mo`;
  return { ...p, price, perMonthLabel: perMonth, originalPrice, amountOff };
}

/**
 * Resolve every plan's price for a site, optionally after the discount attached
 * to `paymentMethod`.
 *
 * The arithmetic happens inside Postgres (`get_site_plan_prices`) so that the
 * page, the create routes and `create_order` itself all read ONE answer. Two
 * code paths that merely agree today would drift the first time either changed;
 * this cannot drift. It also resolves the site canonically, which a direct
 * `pricing` query did not — that query matched on the raw host while the DB
 * matched on `site_settings.site_name`.
 */
export async function getSitePlans(
  siteName: string | null | undefined,
  connections: number,
  paymentMethod?: string | null,
): Promise<SitePlansResult> {
  const conn = Math.min(5, Math.max(1, Number(connections) || 1));
  const base = getFallbackPlans(conn); // labels/metadata only; never a price fallback

  let rows: ResolvedPrice[] | null = null;
  try {
    const { data, error } = await pricingDb.rpc("get_site_plan_prices", {
      p_site: siteName ?? "default",
      p_connections: conn,
      p_payment_method: paymentMethod ?? null,
    });
    if (!error && Array.isArray(data)) rows = data as ResolvedPrice[];
  } catch (err) {
    console.error("get_site_plan_prices threw:", err);
  }

  // No usable database answer → no purchasable plans.
  if (!rows || rows.length === 0) {
    return { plans: [], source: "db" };
  }

  const byId = new Map(rows.map((r) => [r.plan_id, r]));
  const plans = base.flatMap((p) => {
    const hit = byId.get(p.id);
    if (!hit) return [];
    const final = round2(Number(hit.final));
    const original = round2(Number(hit.original));
    const off = round2(Number(hit.amount_off));
    if (!Number.isFinite(final) || final <= 0) return [];
    return withPrice(p, final, Number.isFinite(original) ? original : final, Number.isFinite(off) ? off : 0);
  });

  return { plans, source: "db" };
}

/** Look up ONE plan by id at the authoritative price (used by the create routes). */
export async function getSitePlanById(
  siteName: string | null | undefined,
  planId: string,
  connections: number,
  paymentMethod?: string | null,
): Promise<PricedPlan | undefined> {
  const { plans } = await getSitePlans(siteName, connections, paymentMethod);
  return plans.find((p) => p.id === planId);
}

function pickLinkAt(arr: unknown, index: number): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const at = (i: number) => (typeof arr[i] === "string" ? (arr[i] as string).trim() : "");
  // Each connection count has its own price and must have its own configured link.
  return at(index) || null;
}

/**
 * The PER-PLAN gift-card purchase link for a given plan + connection count,
 * resolved from `pricing.giftcard_link1..4` (parallel to the price columns).
 * Returns null when the site/plan/connection slot is unset. No generic or
 * different-plan fallback is permitted. SERVER-ONLY.
 */
export async function getSiteGiftcardLink(
  siteName: string | null | undefined,
  planId: string,
  connections: number,
): Promise<string | null> {
  const conn = Math.min(5, Math.max(1, Number(connections) || 1));
  const plan = getFallbackPlans(conn).find((p) => p.id === planId); // authoritative plan→months
  if (!plan?.months) return null;
  const col = GIFTCARD_COLUMN_BY_MONTHS[plan.months];
  if (!col) return null;
  const row = await fetchPricingRow(siteName);
  if (!row) return null;
  return pickLinkAt(row[col], conn - 1);
}

/** A missing store link is an unconfigured rail, not a clickable dead end. */
export async function getGiftcardPurchaseUrl(site: string, planId: string, connections: number): Promise<string | null> {
  const link = await getSiteGiftcardLink(site, planId, connections);
  if (!link) return null;
  try { return new URL(String(link)).protocol === "https:" ? String(link) : null; } catch { return null; }
}
