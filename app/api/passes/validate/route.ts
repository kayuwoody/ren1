import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  const { code, product_ids } = await req.json();

  if (!code) {
    return NextResponse.json({ error: 'Pass code is required' }, { status: 400 });
  }

  const { data: pass, error } = await supabase
    .from('member_passes')
    .select('*, loyalty_programs(name)')
    .eq('code', code.toUpperCase())
    .single();

  if (error || !pass) {
    return NextResponse.json({ valid: false, reason: 'Pass not found' }, { status: 404 });
  }

  if (!pass.is_active) {
    return NextResponse.json({ valid: false, reason: 'Pass is no longer active' });
  }

  if (pass.uses_remaining <= 0) {
    return NextResponse.json({ valid: false, reason: 'Pass has no remaining uses' });
  }

  if (pass.expires_at && new Date(pass.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'Pass has expired' });
  }

  const { data: programProducts } = await supabase
    .from('loyalty_program_products')
    .select('product_id')
    .eq('program_id', pass.program_id);

  const eligibleProductIds = new Set((programProducts || []).map(p => p.product_id));

  let applicableProducts: string[] = [];
  if (product_ids && Array.isArray(product_ids)) {
    applicableProducts = product_ids.filter((id: string) => eligibleProductIds.has(id));
  }

  let member = null;
  if (pass.member_id) {
    const { data } = await supabase
      .from('loyalty_members')
      .select('id, phone, name')
      .eq('id', pass.member_id)
      .single();
    member = data;
  }

  return NextResponse.json({
    valid: true,
    pass: {
      id: pass.id,
      code: pass.code,
      program_id: pass.program_id,
      program_name: pass.loyalty_programs?.name || 'Pass',
      uses_remaining: pass.uses_remaining,
      total_uses: pass.total_uses,
      expires_at: pass.expires_at,
    },
    eligible_product_ids: Array.from(eligibleProductIds),
    applicable_products: applicableProducts,
    member,
  });
}
