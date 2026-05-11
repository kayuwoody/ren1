import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

function generateVoucherCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CO-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(req: Request) {
  const body = await req.json();
  const { phone, points_override, notes } = body;

  if (!phone) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }

  const { data: config } = await supabase
    .from('loyalty_config')
    .select('*')
    .eq('id', 'default')
    .single();

  if (!config?.is_active) {
    return NextResponse.json({ error: 'Loyalty program is currently disabled' }, { status: 403 });
  }

  let { data: member } = await supabase
    .from('loyalty_members')
    .select('*')
    .eq('phone', phone)
    .single();

  if (!member) {
    const { data: newMember, error: createErr } = await supabase
      .from('loyalty_members')
      .insert({ phone })
      .select()
      .single();

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    member = newMember;
  }

  const pointsToAdd = points_override ?? config.points_per_scan;
  const newBalance = member.points_balance + pointsToAdd;
  const newTotal = member.total_points_earned + pointsToAdd;

  const { error: txErr } = await supabase
    .from('loyalty_transactions')
    .insert({
      member_id: member.id,
      type: 'earn',
      points: pointsToAdd,
      source: 'scan',
      notes: notes || null,
    });

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  let voucherIssued = null;

  if (newBalance >= config.points_threshold) {
    const pointsToDeduct = config.points_threshold;
    const balanceAfterRedeem = newBalance - pointsToDeduct;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.voucher_validity_days);

    const voucherCode = generateVoucherCode();
    const { data: voucher, error: voucherErr } = await supabase
      .from('vouchers')
      .insert({
        code: voucherCode,
        member_id: member.id,
        type: config.voucher_type,
        discount_value: config.voucher_discount_value,
        min_order_amount: config.voucher_min_order,
        max_uses: 1,
        expires_at: expiresAt.toISOString(),
        source: 'loyalty',
      })
      .select()
      .single();

    if (!voucherErr && voucher) {
      await supabase.from('loyalty_transactions').insert({
        member_id: member.id,
        type: 'redeem',
        points: -pointsToDeduct,
        source: 'voucher_issued',
        reference_id: voucher.id,
        notes: `Voucher ${voucherCode} issued`,
      });

      voucherIssued = voucher;
    }

    await supabase
      .from('loyalty_members')
      .update({
        points_balance: balanceAfterRedeem,
        total_points_earned: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', member.id);

    member.points_balance = balanceAfterRedeem;
  } else {
    await supabase
      .from('loyalty_members')
      .update({
        points_balance: newBalance,
        total_points_earned: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', member.id);

    member.points_balance = newBalance;
  }

  member.total_points_earned = newTotal;

  return NextResponse.json({
    member,
    points_added: pointsToAdd,
    voucher_issued: voucherIssued,
    points_until_voucher: Math.max(0, config.points_threshold - member.points_balance),
  });
}
