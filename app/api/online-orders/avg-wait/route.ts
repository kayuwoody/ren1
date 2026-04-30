import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: recent, error } = await supabase
      .from('online_orders')
      .select('created_at, ready_at')
      .eq('outlet_id', 'main')
      .eq('status', 'collected')
      .not('ready_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const avgSeconds = recent?.length
      ? Math.round(
          recent.reduce(
            (sum, o) =>
              sum + (new Date(o.ready_at!).getTime() - new Date(o.created_at).getTime()) / 1000,
            0
          ) / recent.length
        )
      : 0;

    return NextResponse.json({ avgWaitSeconds: avgSeconds });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to calculate avg wait' }, { status: 500 });
  }
}
