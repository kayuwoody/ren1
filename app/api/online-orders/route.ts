import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('online_orders')
      .select(`
        id, status, pickup_type, outlet_id,
        customer_name, customer_phone,
        total_paid, currency, reject_reason,
        accepted_at, ready_at, created_at, updated_at,
        online_order_items ( id, product_id, product_name, qty, unit_price, mods )
      `)
      .eq('outlet_id', 'main')
      .in('status', ['pending', 'accepted', 'ready'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Supabase fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orders: data ?? [] });
  } catch (err) {
    console.error('Online orders fetch failed:', err);
    return NextResponse.json({ error: 'Failed to fetch online orders' }, { status: 500 });
  }
}
