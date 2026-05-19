import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase
    .from('loyalty_programs')
    .select('*')
    .order('sort_order');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ programs: data });
}

export async function POST(req: Request) {
  const body = await req.json();

  const isPass = body.trigger_type === 'pass';

  const { data, error } = await supabase
    .from('loyalty_programs')
    .insert({
      name: body.name,
      description: body.description || null,
      trigger_type: body.trigger_type,
      points_per_trigger: body.points_per_trigger ?? 1,
      points_per_rm: body.points_per_rm || null,
      threshold: isPass ? 1 : (body.threshold ?? 10),
      voucher_type: body.voucher_type || 'fixed',
      voucher_discount_value: isPass ? 0 : (body.voucher_discount_value ?? 0),
      voucher_validity_days: body.voucher_validity_days ?? 90,
      voucher_min_order: body.voucher_min_order || null,
      pass_type: isPass ? (body.pass_type || 'use_based') : null,
      pass_product_id: isPass ? (body.pass_product_id || null) : null,
      is_active: body.is_active ?? true,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (isPass && body.eligible_product_ids?.length > 0) {
    const rows = body.eligible_product_ids.map((pid: string) => ({
      program_id: data.id,
      product_id: pid,
    }));
    await supabase.from('loyalty_program_products').insert(rows);
  }

  return NextResponse.json({ program: data }, { status: 201 });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: 'Program id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('loyalty_programs')
    .update(fields)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
