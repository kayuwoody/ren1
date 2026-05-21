import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const programId = searchParams.get('program_id');

  if (!programId) {
    return NextResponse.json({ error: 'program_id required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('loyalty_program_products')
    .select('product_id')
    .eq('program_id', programId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product_ids: (data || []).map(r => r.product_id) });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { program_id, product_ids } = body;

  if (!program_id || !Array.isArray(product_ids)) {
    return NextResponse.json({ error: 'program_id and product_ids required' }, { status: 400 });
  }

  await supabase
    .from('loyalty_program_products')
    .delete()
    .eq('program_id', program_id);

  if (product_ids.length > 0) {
    const rows = product_ids.map((pid: string) => ({
      program_id,
      product_id: pid,
    }));
    const { error } = await supabase
      .from('loyalty_program_products')
      .insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, count: product_ids.length });
}
