import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ voucherId: string }> }
) {
  const { voucherId } = await params;
  const body = await req.json();

  const { error } = await supabase
    .from('vouchers')
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', voucherId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ voucherId: string }> }
) {
  const { voucherId } = await params;

  const { error } = await supabase
    .from('vouchers')
    .delete()
    .eq('id', voucherId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
