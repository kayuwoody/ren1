import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { todayRangeKL } from '@/lib/dateUtils';

export async function POST(req: Request) {
  const { code, product_ids } = await req.json();

  if (!code) {
    return NextResponse.json({ error: 'Pass code is required' }, { status: 400 });
  }

  const { data: enrollment, error } = await supabase
    .from('loyalty_member_programs')
    .select('*, loyalty_programs(name, pass_type, pass_daily_limit)')
    .eq('code', code.toUpperCase())
    .single();

  if (error || !enrollment) {
    return NextResponse.json({ valid: false, reason: 'Pass not found' }, { status: 404 });
  }

  if (!enrollment.is_active) {
    return NextResponse.json({ valid: false, reason: 'Pass is no longer active' });
  }

  if (enrollment.points_balance <= 0) {
    return NextResponse.json({ valid: false, reason: 'Pass has no remaining uses' });
  }

  if (enrollment.expires_at && new Date(enrollment.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'Pass has expired' });
  }

  const dailyLimit = enrollment.loyalty_programs?.pass_daily_limit;
  let usesToday = 0;
  let effectiveRemaining = enrollment.points_balance;

  if (dailyLimit && dailyLimit > 0) {
    const { start, end } = todayRangeKL();
    const { count } = await supabase
      .from('member_pass_usage')
      .select('id', { count: 'exact', head: true })
      .eq('enrollment_id', enrollment.id)
      .gte('used_at', start)
      .lt('used_at', end);

    usesToday = count || 0;
    const dailyRemaining = dailyLimit - usesToday;

    if (dailyRemaining <= 0) {
      return NextResponse.json({ valid: false, reason: `Daily limit reached (${dailyLimit} per day)` });
    }

    effectiveRemaining = Math.min(enrollment.points_balance, dailyRemaining);
  }

  const { data: programProducts } = await supabase
    .from('loyalty_program_products')
    .select('product_id')
    .eq('program_id', enrollment.program_id);

  const eligibleProductIds = new Set((programProducts || []).map(p => p.product_id));

  let applicableProducts: string[] = [];
  if (product_ids && Array.isArray(product_ids)) {
    applicableProducts = product_ids.filter((id: string) => eligibleProductIds.has(id));
  }

  let member = null;
  if (enrollment.member_id) {
    const { data } = await supabase
      .from('loyalty_members')
      .select('id, phone, name')
      .eq('id', enrollment.member_id)
      .single();
    member = data;
  }

  return NextResponse.json({
    valid: true,
    pass: {
      id: enrollment.id,
      code: enrollment.code,
      program_id: enrollment.program_id,
      program_name: enrollment.loyalty_programs?.name || 'Pass',
      uses_remaining: effectiveRemaining,
      total_uses: enrollment.total_earned,
      expires_at: enrollment.expires_at,
      daily_limit: dailyLimit || null,
      uses_today: usesToday,
    },
    eligible_product_ids: Array.from(eligibleProductIds),
    applicable_products: applicableProducts,
    member,
  });
}
