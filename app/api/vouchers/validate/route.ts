import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  const body = await req.json();
  const { code, order_total } = body;

  if (!code) {
    return NextResponse.json({ error: 'Voucher code is required' }, { status: 400 });
  }

  const { data: voucher, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();

  if (error || !voucher) {
    return NextResponse.json({ valid: false, reason: 'Voucher code not found' }, { status: 404 });
  }

  if (!voucher.is_active) {
    return NextResponse.json({ valid: false, reason: 'Voucher is no longer active' });
  }

  if (voucher.times_used >= voucher.max_uses) {
    return NextResponse.json({ valid: false, reason: 'Voucher has been fully used' });
  }

  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'Voucher has expired' });
  }

  if (order_total !== undefined && voucher.min_order_amount > 0 && order_total < voucher.min_order_amount) {
    return NextResponse.json({
      valid: false,
      reason: `Minimum order amount is RM ${voucher.min_order_amount.toFixed(2)}`,
    });
  }

  const discount = voucher.type === 'percent'
    ? (order_total || 0) * (voucher.discount_value / 100)
    : voucher.discount_value;

  let member = null;
  if (voucher.member_id) {
    const { data } = await supabase
      .from('loyalty_members')
      .select('id, phone, name')
      .eq('id', voucher.member_id)
      .single();
    member = data;
  }

  return NextResponse.json({
    valid: true,
    voucher: {
      id: voucher.id,
      code: voucher.code,
      type: voucher.type,
      discount_value: voucher.discount_value,
      discount_amount: Math.round(discount * 100) / 100,
      min_order_amount: voucher.min_order_amount,
    },
    member,
  });
}
