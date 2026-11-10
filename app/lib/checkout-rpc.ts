import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { cfg } from './runtime-config';

/** Server-only, action AND payload-bound authorization. Never accepts a
 * clearance from the browser. The legacy public mutation RPCs are revoked at
 * cutover; only this explicit allow-list dispatcher remains public. */
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function checkoutRpc(action: string, payload: Record<string, unknown> = {}) {
  const secret = await cfg('ORDER_UPDATE_HMAC');
  if (!secret) throw new Error('Checkout authorization is not configured');
  const text = JSON.stringify(payload);
  return db.rpc('checkout_dispatch', {
    p_action: action,
    p_payload: text,
    p_clearance: createHmac('sha256', secret).update(`${action}:${text}`).digest('hex'),
  });
}
