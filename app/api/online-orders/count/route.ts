import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Active online-order count + arrived-customer flag for the admin dashboard.
 * Server-side (service-role) replacement for the dashboard's former direct
 * anon-key query, so the browser no longer needs Supabase access.
 */
export async function GET() {
  try {
    const [countRes, arrivedRes] = await Promise.all([
      supabase
        .from('online_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'accepted', 'ready']),
      supabase
        .from('online_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['accepted', 'ready'])
        .not('arrived_at', 'is', null),
    ]);

    return NextResponse.json({
      count: countRes.count ?? 0,
      hasArrivedCustomer: (arrivedRes.count ?? 0) > 0,
    });
  } catch {
    return NextResponse.json({ count: 0, hasArrivedCustomer: false });
  }
}
