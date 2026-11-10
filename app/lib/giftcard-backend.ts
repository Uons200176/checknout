import { cfg } from './runtime-config';

export class GiftcardBackendError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

/** Server-only bridge. Provider key, value checks and redemption stay in Core. */
async function call(path: string, body?: { orderId: string; code: string }): Promise<Record<string, unknown>> {
  const base = process.env.BACKEND_URL;
  const key = await cfg('GATEWAY_REDEEM_KEY');
  if (!base || !key) throw new GiftcardBackendError(503, 'Gift-card payment is temporarily unavailable. Do not buy another card.');
  const origin = new URL(base);
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) {
    throw new GiftcardBackendError(503, 'Secure gift-card connection is unavailable.');
  }
  try {
    const response = await fetch(new URL(`/gateway/giftcards/${path}`, origin), {
      method: body ? 'POST' : 'GET', headers: { 'x-giftcard-key': key, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(body ? 65_000 : 5_000),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const message = data && typeof data === 'object' ? (data as Record<string, unknown>).message : null;
      throw new GiftcardBackendError([400, 404, 409, 429].includes(response.status) ? response.status : 503,
        response.status < 500 && response.status !== 401 && response.status !== 403 && typeof message === 'string'
          ? message : 'Could not confirm the gift-card result. Refresh this order or contact support; do not buy another card.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid reply');
    return data as Record<string, unknown>;
  } catch (e) {
    if (e instanceof GiftcardBackendError) throw e;
    throw new GiftcardBackendError(503, 'Connection interrupted. Check this order’s status before retrying the same code. Do not submit a different card.');
  }
}

export async function giftcardAvailable(): Promise<boolean> {
  try { return (await call('availability')).available === true; } catch { return false; }
}
export async function getGiftcardStatus(orderId: string) { return call(encodeURIComponent(orderId)); }
export async function redeemGiftcard(orderId: string, code: string) { return call('redeem', { orderId, code }); }
