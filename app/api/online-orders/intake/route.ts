import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('outlet_settings')
      .select('intake_paused')
      .eq('outlet_id', 'main')
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ intake_paused: data?.intake_paused ?? false });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch intake status' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { paused } = await req.json();

    const { error } = await supabase
      .from('outlet_settings')
      .upsert(
        { outlet_id: 'main', intake_paused: !!paused },
        { onConflict: 'outlet_id' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, intake_paused: !!paused });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update intake status' }, { status: 500 });
  }
}
