/**
 * DYNAMIC runtime configuration for the checkout.
 *
 * Only the Supabase bootstrap values and this app's identity stay in `.env`.
 * Every real secret (NOWPayments, PayGate, Resend, Turnstile, the RPC clearance
 * HMACs, the cron secret) lives in the `app_secrets` table and is fetched from
 * the Core Backend at runtime — so a key can be rotated from the dashboard with
 * no redeploy of this app.
 *
 * Why fetch instead of reading the DB directly: this app holds only the PUBLIC
 * anon key, and `app_secrets` is service_role-only (RLS + revoked grants). It
 * authenticates with ONE bootstrap credential (BACKEND_CONFIG_KEY) that unlocks
 * only the 'gateway' category.
 *
 * Resilience: values are cached in memory, refreshed in the background, and
 * `process.env` remains the fallback — a backend blip can never take checkout
 * down. SERVER-ONLY: never import from a client component.
 */
const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

let cache: Record<string, string> = {};
let fetchedAt = 0;
let inflight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  const baseUrl = (process.env.BACKEND_URL ?? '').replace(/\/+$/, '');
  const configKey = process.env.BACKEND_CONFIG_KEY ?? '';
  if (!baseUrl || !configKey) return; // not wired yet → pure env mode

  try {
    const res = await fetch(`${baseUrl}/config/gateway`, {
      headers: { 'x-config-key': configKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`runtime-config: backend returned ${res.status}`);
      return;
    }
    const body = (await res.json()) as { config?: Record<string, string> };
    if (body?.config && typeof body.config === 'object') {
      cache = body.config;
      fetchedAt = Date.now();
    }
  } catch (err) {
    console.error('runtime-config: fetch failed —', (err as Error).message);
  }
}

/** Ensure the cache is reasonably fresh (single-flight). */
async function ensureFresh(): Promise<void> {
  if (Date.now() - fetchedAt < TTL_MS) return;
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  await inflight;
}

/**
 * A configuration value: database first, then `process.env`, then the fallback.
 * Always `await` it — it refreshes from the backend when the cache is stale.
 */
export async function cfg(key: string, fallback = ''): Promise<string> {
  await ensureFresh();
  const fromDb = (cache[key] ?? '').trim();
  if (fromDb) return fromDb;
  return (process.env[key] ?? '').trim() || fallback;
}

/** Several values at once (one freshness check). */
export async function cfgMany<K extends string>(keys: readonly K[]): Promise<Record<K, string>> {
  await ensureFresh();
  const out = {} as Record<K, string>;
  for (const k of keys) {
    out[k] = (cache[k] ?? '').trim() || (process.env[k] ?? '').trim();
  }
  return out;
}

/** Diagnostics: where config is coming from right now. */
export function configSource(): 'backend' | 'env' {
  return Object.keys(cache).length > 0 ? 'backend' : 'env';
}
