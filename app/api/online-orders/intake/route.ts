import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

function isWithinSchedule(): boolean {
  const now = new Date(Date.now() + KL_OFFSET_MS);
  const day = now.getUTCDay(); // 0=Sun
  if (day === 0) return false;

  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const timeMinutes = hour * 60 + minute;

  // 8:00 AM = 480, 8:30 PM = 1230
  return timeMinutes >= 480 && timeMinutes < 1230;
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('outlet_settings')
      .select('intake_paused, intake_force_open')
      .eq('outlet_id', 'main')
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const manualPaused = data?.intake_paused ?? false;
    const forceOpen = data?.intake_force_open ?? false;
    const scheduled = isWithinSchedule();

    // Force open overrides schedule; manual pause overrides everything
    const effectivelyPaused = manualPaused || (!scheduled && !forceOpen);

    return NextResponse.json({
      intake_paused: effectivelyPaused,
      scheduled,
      manual_paused: manualPaused,
      force_open: forceOpen,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch intake status' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === 'force_open') {
      const { error } = await supabase
        .from('outlet_settings')
        .upsert(
          { outlet_id: 'main', intake_force_open: true, intake_paused: false },
          { onConflict: 'outlet_id' }
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, intake_paused: false, force_open: true });
    }

    if (body.action === 'close') {
      const { error } = await supabase
        .from('outlet_settings')
        .upsert(
          { outlet_id: 'main', intake_paused: true, intake_force_open: false },
          { onConflict: 'outlet_id' }
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, intake_paused: true, force_open: false });
    }

    if (body.action === 'auto') {
      // Reset to schedule-driven
      const { error } = await supabase
        .from('outlet_settings')
        .upsert(
          { outlet_id: 'main', intake_paused: false, intake_force_open: false },
          { onConflict: 'outlet_id' }
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const scheduled = isWithinSchedule();
      return NextResponse.json({ success: true, intake_paused: !scheduled, force_open: false });
    }

    // Legacy toggle support
    const { paused } = body;
    const { error } = await supabase
      .from('outlet_settings')
      .upsert(
        { outlet_id: 'main', intake_paused: !!paused, intake_force_open: !paused ? false : false },
        { onConflict: 'outlet_id' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, intake_paused: !!paused });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update intake status' }, { status: 500 });
  }
}
