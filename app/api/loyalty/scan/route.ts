import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { upsertMember, awardPoints } from '@/lib/loyaltyService';

export async function POST(req: Request) {
  const body = await req.json();
  const { phone, name } = body;

  if (!phone) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }

  const { data: programs } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('trigger_type', 'scan')
    .eq('is_active', true)
    .order('sort_order');

  if (!programs || programs.length === 0) {
    return NextResponse.json({ error: 'No active scan programs' }, { status: 404 });
  }

  const member = await upsertMember(phone.trim(), name);
  const now = new Date().toISOString();

  const results = [];
  for (const program of programs) {
    const result = await awardPoints(member, program, {
      type: 'earn',
      description: 'Visit scan',
      reference_id: null,
      now,
    });
    results.push({
      program_id: program.id,
      program_name: program.name,
      ...result,
    });
  }

  const { data: balances } = await supabase
    .from('loyalty_member_programs')
    .select('*, loyalty_programs(name, threshold)')
    .eq('member_id', member.id);

  return NextResponse.json({
    member,
    results,
    balances: balances || [],
  });
}
