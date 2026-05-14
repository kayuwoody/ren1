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

  const { data, error } = await supabase
    .from('loyalty_programs')
    .insert({
      name: body.name,
      description: body.description || null,
      trigger_type: body.trigger_type,
      points_per_trigger: body.points_per_trigger ?? 1,
      points_per_rm: body.points_per_rm || null,
      threshold: body.threshold,
      voucher_type: body.voucher_type || 'fixed',
      voucher_discount_value: body.voucher_discount_value,
      voucher_validity_days: body.voucher_validity_days ?? 90,
      voucher_min_order: body.voucher_min_order || null,
      is_active: body.is_active ?? true,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
