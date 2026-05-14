import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['accepted', 'rejected'],
  accepted: ['ready', 'rejected'],
  ready: ['collected'],
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const body = await req.json();
    const { status: newStatus, reject_reason } = body;

    if (!newStatus) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('online_orders')
      .select('id, status, online_order_items ( id, product_id, qty )')
      .eq('id', orderId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from ${existing.status} to ${newStatus}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'accepted') updates.accepted_at = now;
    if (newStatus === 'ready') updates.ready_at = now;
    if (newStatus === 'collected') updates.collected_at = now;
    if (newStatus === 'rejected') {
      updates.rejected_at = now;
      updates.reject_reason = reject_reason ?? null;
    }

    const { error: updateErr } = await supabase
      .from('online_orders')
      .update(updates)
      .eq('id', orderId);

    if (updateErr) {
      console.error('Status update error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (newStatus === 'accepted' && existing.online_order_items) {
      for (const item of existing.online_order_items as any[]) {
        if (item.product_id) {
          await supabase.rpc('decrement_stock', {
            p_product_id: item.product_id,
            p_outlet_id: 'main',
            p_qty: item.qty,
          });
        }
      }
    }

    return NextResponse.json({ success: true, orderId, status: newStatus });
  } catch (err) {
    console.error('Online order update failed:', err);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
