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

/**
 * Upsert outlet settings, tolerating a missing `intake_force_open` column.
 * The scheduling feature added `intake_force_open` but older Supabase schemas
 * may not have it yet — in that case we fall back to writing only the columns
 * that definitely exist so the core pause/resume still works.
 */
async function upsertIntake(fields: { intake_paused?: boolean; intake_force_open?: boolean }) {
  const full = await supabase
    .from('outlet_settings')
    .upsert({ outlet_id: 'main', ...fields }, { onConflict: 'outlet_id' });

  if (!full.error) return { error: null };

  // Retry without intake_force_open (likely missing column)
  if ('intake_force_open' in fields) {
    const { intake_force_open, ...rest } = fields;
    if (Object.keys(rest).length === 0) return { error: null };
    const fallback = await supabase
      .from('outlet_settings')
      .upsert({ outlet_id: 'main', ...rest }, { onConflict: 'outlet_id' });
    return { error: fallback.error };
  }

  return { error: full.error };
}

export async function GET() {
  try {
    // Try to read force_open; fall back to just intake_paused if the column is absent
    let data: { intake_paused?: boolean; intake_force_open?: boolean } | null = null;

    const full = await supabase
      .from('outlet_settings')
      .select('intake_paused, intake_force_open')
      .eq('outlet_id', 'main')
      .single();

    if (full.error) {
      if (full.error.code === 'PGRST116') {
        data = null; // no row yet — use defaults
      } else {
        // Likely missing intake_force_open column — retry with just intake_paused
        const basic = await supabase
          .from('outlet_settings')
          .select('intake_paused')
          .eq('outlet_id', 'main')
          .single();
        if (basic.error && basic.error.code !== 'PGRST116') {
          return NextResponse.json({ error: basic.error.message }, { status: 500 });
        }
        data = basic.data;
      }
    } else {
      data = full.data;
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
      const { error } = await upsertIntake({ intake_force_open: true, intake_paused: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, intake_paused: false, force_open: true });
    }

    if (body.action === 'close') {
      const { error } = await upsertIntake({ intake_paused: true, intake_force_open: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, intake_paused: true, force_open: false });
    }

    if (body.action === 'auto') {
      // Reset to schedule-driven
      const { error } = await upsertIntake({ intake_paused: false, intake_force_open: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const scheduled = isWithinSchedule();
      return NextResponse.json({ success: true, intake_paused: !scheduled, force_open: false });
    }

    // Legacy toggle support
    const { paused } = body;
    const { error } = await upsertIntake({ intake_paused: !!paused, intake_force_open: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, intake_paused: !!paused });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update intake status' }, { status: 500 });
  }
}
