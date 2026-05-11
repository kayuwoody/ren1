import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const active = url.searchParams.get('active');
  const member_id = url.searchParams.get('member_id');

  let query = supabase
    .from('vouchers')
    .select('*, loyalty_members(phone, name), loyalty_programs(name)')
    .order('created_at', { ascending: false });

  if (active === 'true') query = query.eq('is_active', true);
  if (member_id) query = query.eq('member_id', member_id);

  const { data, error } = await query.limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vouchers: data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { code, type, discount_amount, min_order, max_uses, expires_at, member_id, program_id } = body;

  if (!code || !discount_amount) {
    return NextResponse.json({ error: 'code and discount_amount are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('vouchers')
    .insert({
      code: code.toUpperCase(),
      type: type || 'fixed',
      discount_amount,
      min_order: min_order || null,
      max_uses: max_uses || 1,
      expires_at: expires_at || null,
      member_id: member_id || null,
      program_id: program_id || null,
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
