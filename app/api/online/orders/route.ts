import { NextResponse } from 'next/server';
import { supabase } from '@/lib/online/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/online/orders?outlet=main&status=pending,accepted,ready
 * Used by the POS to hydrate the queue on startup and after reconnect.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const outlet = url.searchParams.get('outlet') ?? 'main';
  const statusParam = url.searchParams.get('status');

  const statuses = statusParam
    ? statusParam.split(',').map(s => s.trim()).filter(Boolean)
    : ['pending', 'accepted', 'ready'];

  const { data: orders, error } = await supabase
    .from('online_orders')
    .select(`
      id, status, pickup_type, outlet_id,
      customer_name, customer_phone,
      total_paid, currency,
      reject_reason,
      accepted_at, ready_at, collected_at, rejected_at, created_at, updated_at,
      online_order_items ( id, product_id, product_name, qty, unit_price, mods )
    `)
    .eq('outlet_id', outlet)
    .in('status', statuses)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[GET /api/online/orders]', error.message);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }

  const { data: settings } = await supabase
    .from('outlet_settings')
    .select('intake_paused')
    .eq('outlet_id', outlet)
    .single();

  // Average wait: seconds between created_at and ready_at for recent completed orders
  const { data: recent } = await supabase
    .from('online_orders')
    .select('created_at, ready_at')
    .eq('outlet_id', outlet)
    .eq('status', 'collected')
    .not('ready_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  let avgWaitSeconds = 0;
  if (recent && recent.length > 0) {
    const diffs = recent
      .filter(o => o.ready_at)
      .map(o => (new Date(o.ready_at!).getTime() - new Date(o.created_at).getTime()) / 1000);
    avgWaitSeconds = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  }

  return NextResponse.json({
    orders: orders ?? [],
    intake_paused: settings?.intake_paused ?? false,
    avg_wait_seconds: avgWaitSeconds,
  });
}
