import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { awardPoints, LoyaltyProgram } from '@/lib/loyaltyService';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params;
  const body = await req.json();
  const { program_id, points, description } = body;

  if (!program_id || !points || !description) {
    return NextResponse.json(
      { error: 'program_id, points, and description are required' },
      { status: 400 }
    );
  }

  const { data: member } = await supabase
    .from('loyalty_members')
    .select('id')
    .eq('id', memberId)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const { data: program } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('id', program_id)
    .single();

  if (!program) {
    return NextResponse.json({ error: 'Program not found' }, { status: 404 });
  }

  const result = await awardPoints(member, program as LoyaltyProgram, {
    type: 'manual',
    description,
    reference_id: null,
    pointsOverride: points,
  });

  return NextResponse.json(result);
}
