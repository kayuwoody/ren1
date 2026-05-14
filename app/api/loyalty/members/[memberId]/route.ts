import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params;

  const { data: member, error: memberErr } = await supabase
    .from('loyalty_members')
    .select('*')
    .eq('id', memberId)
    .single();

  if (memberErr || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const { data: balances } = await supabase
    .from('loyalty_member_programs')
    .select('*, loyalty_programs(name, threshold, trigger_type)')
    .eq('member_id', memberId);

  const { data: transactions } = await supabase
    .from('loyalty_transactions')
    .select('*, loyalty_programs(name)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: vouchers } = await supabase
    .from('vouchers')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    member,
    balances: balances || [],
    transactions: transactions || [],
    vouchers: vouchers || [],
  });
}
