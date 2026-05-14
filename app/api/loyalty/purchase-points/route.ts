import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { awardPoints, LoyaltyProgram } from '@/lib/loyaltyService';

const PURCHASE_PROGRAM_ID = '17559988-7a8c-4665-91d1-1760b87ced31';

export async function POST(req: Request) {
  const { member_id, order_total, order_id } = await req.json();

  if (!member_id || order_total == null) {
    return NextResponse.json({ error: 'member_id and order_total required' }, { status: 400 });
  }

  const { data: program } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('id', PURCHASE_PROGRAM_ID)
    .single();

  if (!program || !program.is_active) {
    return NextResponse.json({ skipped: true, reason: 'Purchase program not active' });
  }

  const pointsPerRm = program.points_per_rm ?? 1;
  const pointsToAward = Math.floor(order_total * pointsPerRm);

  if (pointsToAward <= 0) {
    return NextResponse.json({ skipped: true, reason: 'Order too small for points' });
  }

  const { data: member } = await supabase
    .from('loyalty_members')
    .select('id, phone, name')
    .eq('id', member_id)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const result = await awardPoints(member, program as LoyaltyProgram, {
    type: 'earn',
    description: `Purchase RM ${order_total.toFixed(2)}`,
    reference_id: order_id || null,
    pointsOverride: pointsToAward,
  });

  return NextResponse.json({
    awarded: true,
    points: pointsToAward,
    ...result,
  });
}
