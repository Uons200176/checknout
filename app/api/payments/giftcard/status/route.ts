import { NextRequest, NextResponse } from 'next/server';
import { getGiftcardStatus, GiftcardBackendError } from '@/app/lib/giftcard-backend';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('orderId');
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid order link.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getGiftcardStatus(id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof GiftcardBackendError ? e.message : 'Could not load order status.' },
      { status: e instanceof GiftcardBackendError ? e.status : 503 });
  }
}
