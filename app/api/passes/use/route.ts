import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  const { pass_id, order_id, product_ids } = await req.json();

  if (!pass_id || !order_id || !product_ids?.length) {
    return NextResponse.json({ error: 'pass_id, order_id, and product_ids required' }, { status: 400 });
  }

  const { data: pass, error } = await supabase
    .from('member_passes')
    .select('id, uses_remaining, is_active, expires_at, program_id')
    .eq('id', pass_id)
    .single();

  if (error || !pass) {
    return NextResponse.json({ error: 'Pass not found' }, { status: 404 });
  }

  if (!pass.is_active || pass.uses_remaining <= 0) {
    return NextResponse.json({ error: 'Pass is not usable' }, { status: 400 });
  }

  if (pass.expires_at && new Date(pass.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Pass has expired' }, { status: 400 });
  }

  const { data: programProducts } = await supabase
    .from('loyalty_program_products')
    .select('product_id')
    .eq('program_id', pass.program_id);

  const eligibleSet = new Set((programProducts || []).map(p => p.product_id));
  const validProductIds = product_ids.filter((id: string) => eligibleSet.has(id));

  if (validProductIds.length === 0) {
    return NextResponse.json({ error: 'No eligible products in this order' }, { status: 400 });
  }

  const usesToDeduct = Math.min(validProductIds.length, pass.uses_remaining);
  const productsToApply = validProductIds.slice(0, usesToDeduct);

  const { error: updateErr } = await supabase
    .from('member_passes')
    .update({
      uses_remaining: pass.uses_remaining - usesToDeduct,
      is_active: pass.uses_remaining - usesToDeduct > 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pass_id);

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update pass' }, { status: 500 });
  }

  const usageRows = productsToApply.map((productId: string) => ({
    pass_id,
    order_id,
    product_id: productId,
    used_at: new Date().toISOString(),
  }));

  const { error: usageErr } = await supabase
    .from('member_pass_usage')
    .insert(usageRows);

  if (usageErr) {
    console.error('Failed to record pass usage:', usageErr);
  }

  return NextResponse.json({
    success: true,
    uses_deducted: usesToDeduct,
    uses_remaining: pass.uses_remaining - usesToDeduct,
    products_applied: productsToApply,
  });
}
