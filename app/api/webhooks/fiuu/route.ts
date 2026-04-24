import { NextResponse } from 'next/server';
import { verifyFiuuCallback, isFiuuSuccess } from '@/lib/online/fiuu';
import { supabase } from '@/lib/online/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch {
    return new Response('bad body', { status: 400 });
  }

  let valid = false;
  try {
    valid = verifyFiuuCallback(body);
  } catch (e: any) {
    console.error('[fiuu-webhook] verification error:', e.message);
    return new Response('config error', { status: 500 });
  }

  if (!valid) {
    console.warn('[fiuu-webhook] invalid skey', { tranID: body.tranID, orderID: body.orderID });
    return new Response('invalid skey', { status: 400 });
  }

  const { tranID, status, amount, currency = 'MYR' } = body;

  if (!tranID) {
    return new Response('missing tranID', { status: 400 });
  }

  const { error } = await supabase
    .from('fiuu_payments')
    .upsert(
      {
        payment_ref: tranID,
        amount: parseFloat(amount),
        currency,
        status_code: status,
        raw_payload: body,
      },
      { onConflict: 'payment_ref' }
    );

  if (error) {
    console.error('[fiuu-webhook] db error:', error.message);
    return new Response('db error', { status: 500 });
  }

  if (!isFiuuSuccess(status)) {
    console.log(`[fiuu-webhook] non-success status ${status} for tranID ${tranID} — recorded`);
  } else {
    console.log(`[fiuu-webhook] payment confirmed: tranID=${tranID} amount=${amount}`);
  }

  return new Response('OK', { status: 200 });
}
