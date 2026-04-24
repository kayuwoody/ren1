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
  try { valid = verifyFiuuCallback(body); }
  catch (e: any) { return new Response('config error', { status: 500 }); }

  if (!valid) return new Response('invalid skey', { status: 400 });

  const { tranID, status, amount, currency = 'MYR' } = body;
  if (!tranID) return new Response('missing tranID', { status: 400 });

  const { error } = await supabase.from('fiuu_payments').upsert(
    { payment_ref: tranID, amount: parseFloat(amount), currency, status_code: status, raw_payload: body },
    { onConflict: 'payment_ref' }
  );

  if (error) return new Response('db error', { status: 500 });

  return new Response('OK', { status: 200 });
}
