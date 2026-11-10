/** Real Rewarble redemption in Core Backend; never a manual-code fallback. */
import { NextRequest, NextResponse } from 'next/server';
import { readJsonCapped } from '@/app/lib/customer-input';
import { GiftcardBackendError, redeemGiftcard } from '@/app/lib/giftcard-backend';

export const maxDuration = 75;
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonCapped(req, 1024);
    if (!body || typeof body.code !== 'string' || body.code.length > 100) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const code = body.code.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z0-9]{12,64}$/.test(code)) return NextResponse.json({ error:
      'Paste the complete gift-card code, not the order number. Open your G2A email, click Get order, then reveal and copy the code.' }, { status: 400 });
    if (typeof body.orderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.orderId)) {
      return NextResponse.json({ error: 'Invalid order link.' }, { status: 400 });
    }
    // Never forward browser prices, currencies, tolerances or provider results.
    const result = await redeemGiftcard(body.orderId, code);
    // Existing database pending-transition outbox sends the receipt once.
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof GiftcardBackendError ? e.message : 'Could not confirm redemption. Refresh this order before retrying.' },
      { status: e instanceof GiftcardBackendError ? e.status : 503 });
  }
}
