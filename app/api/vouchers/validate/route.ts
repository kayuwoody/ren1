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

  if (order_total !== undefined && voucher.min_order && order_total < voucher.min_order) {
    return NextResponse.json({
      valid: false,
      reason: `Minimum order amount is RM ${voucher.min_order.toFixed(2)}`,
    });
  }

  const discount = voucher.type === 'percent'
    ? (order_total || 0) * (voucher.discount_amount / 100)
    : voucher.discount_amount;

  return NextResponse.json({
    valid: true,
    voucher: {
      id: voucher.id,
      code: voucher.code,
      type: voucher.type,
      discount_amount: voucher.discount_amount,
      calculated_discount: Math.round(discount * 100) / 100,
      min_order: voucher.min_order,
    },
  });
}
