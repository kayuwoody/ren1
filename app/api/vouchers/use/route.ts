import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  const { code } = await req.json();

  if (!code) {
    return NextResponse.json({ error: 'Voucher code is required' }, { status: 400 });
  }

  const upperCode = code.toUpperCase();

  const { error: rpcError } = await supabase.rpc('increment_voucher_usage', {
    voucher_code: upperCode,
  });

  if (rpcError) {
    const { data: v } = await supabase
      .from('vouchers')
      .select('id, times_used')
      .eq('code', upperCode)
      .single();

    if (v) {
      await supabase
        .from('vouchers')
        .update({ times_used: v.times_used + 1, updated_at: new Date().toISOString() })
        .eq('id', v.id);
    }
  }

  return NextResponse.json({ success: true });
}
