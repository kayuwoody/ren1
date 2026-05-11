import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get('source');
  const active = url.searchParams.get('active');

  let query = supabase
    .from('vouchers')
    .select('*, loyalty_members(phone, name)')
    .order('created_at', { ascending: false });

  if (source) query = query.eq('source', source);
  if (active === 'true') query = query.eq('is_active', true);

  const { data, error } = await query.limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vouchers: data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { code, type, discount_value, min_order_amount, max_uses, expires_at, member_id } = body;

  if (!code || !discount_value) {
    return NextResponse.json({ error: 'code and discount_value are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('vouchers')
    .insert({
      code: code.toUpperCase(),
      type: type || 'fixed',
      discount_value,
      min_order_amount: min_order_amount || 0,
      max_uses: max_uses || 1,
      expires_at: expires_at || null,
      member_id: member_id || null,
      source: 'manual',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Voucher code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ voucher: data }, { status: 201 });
}
