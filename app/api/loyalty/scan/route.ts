import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { upsertMember, awardPoints } from '@/lib/loyaltyService';
import { todayRangeKL } from '@/lib/dateUtils';

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

  const { start, end } = todayRangeKL();
  console.log(`🔍 Dedup check: member=${member.id}, range=${start} to ${end}`);

  const { data: todayScans, error: scanQueryErr } = await supabase
    .from('loyalty_transactions')
    .select('program_id')
    .eq('member_id', member.id)
    .eq('type', 'earn')
    .gte('created_at', start)
    .lt('created_at', end);

  if (scanQueryErr) console.error('❌ Dedup query error:', scanQueryErr);
  console.log(`🔍 Found ${todayScans?.length || 0} existing scans today:`, todayScans?.map(t => t.program_id));

  const scannedProgramIds = new Set((todayScans || []).map(t => t.program_id));

  const results = [];
  for (const program of programs) {
    if (scannedProgramIds.has(program.id)) {
      results.push({
        program_id: program.id,
        program_name: program.name,
        skipped: true,
        reason: 'already_scanned_today',
      });
      continue;
    }

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

  const allSkipped = results.every((r: any) => r.skipped);

  const { data: balances } = await supabase
    .from('loyalty_member_programs')
    .select('*, loyalty_programs(name, threshold)')
    .eq('member_id', member.id);

  return NextResponse.json({
    member,
    results,
    balances: balances || [],
    already_scanned_today: allSkipped,
  });
}
