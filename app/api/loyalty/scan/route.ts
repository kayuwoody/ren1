import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { upsertMember, awardPoints } from '@/lib/loyaltyService';

function todayRangeKL() {
  // Malaysia is always UTC+8 (no DST) — direct calculation avoids locale parsing issues on Windows
  const KL_OFFSET_MS = 8 * 60 * 60 * 1000;
  const klNowMs = Date.now() + KL_OFFSET_MS;
  const klDayStartMs = Math.floor(klNowMs / 86_400_000) * 86_400_000;
  return {
    start: new Date(klDayStartMs - KL_OFFSET_MS).toISOString(),
    end: new Date(klDayStartMs - KL_OFFSET_MS + 86_400_000).toISOString(),
  };
}

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
  const { data: todayScans } = await supabase
    .from('loyalty_transactions')
    .select('program_id')
    .eq('member_id', member.id)
    .eq('type', 'earn')
    .gte('created_at', start)
    .lt('created_at', end);

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
