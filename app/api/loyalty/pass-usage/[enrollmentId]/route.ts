import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ enrollmentId: string }> }
) {
  const { enrollmentId } = await params;

  const { data: usage, error } = await supabase
    .from('member_pass_usage')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .order('used_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ usage: usage || [] });
}
