import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase
    .from('loyalty_config')
    .select('*')
    .eq('id', 'default')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const body = await req.json();

  const { error } = await supabase
    .from('loyalty_config')
    .update({
      points_per_scan: body.points_per_scan,
      points_threshold: body.points_threshold,
      voucher_type: body.voucher_type,
      voucher_discount_value: body.voucher_discount_value,
      voucher_validity_days: body.voucher_validity_days,
      voucher_min_order: body.voucher_min_order,
      is_active: body.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'default');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
