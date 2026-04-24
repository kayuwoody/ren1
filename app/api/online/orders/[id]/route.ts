import { NextResponse } from 'next/server';
import { supabase } from '@/lib/online/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:   ['accepted', 'rejected'],
  accepted:  ['ready', 'rejected'],
  ready:     ['collected'],
  collected: [],
  rejected:  [],
};

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if ('intake_paused' in body) {
    const outlet = (body.outlet_id as string | undefined) ?? 'main';
    const { error } = await supabase
      .from('outlet_settings')
      .upsert(
        { outlet_id: outlet, intake_paused: Boolean(body.intake_paused) },
        { onConflict: 'outlet_id' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ outlet_id: outlet, intake_paused: Boolean(body.intake_paused) });
  }

  const newStatus = body.status as string | undefined;
  if (!newStatus) {
    return NextResponse.json({ error: 'Must supply status or intake_paused' }, { status: 400 });
  }

  const { data: order, error: fetchErr } = await supabase
    .from('online_orders')
    .select('id, status, outlet_id, customer_phone, customer_fcm_token, total_paid')
    .eq('id', id)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${order.status} to ${newStatus}` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status: newStatus, updated_at: now };

  if (newStatus === 'accepted')  updates.accepted_at  = now;
  if (newStatus === 'ready')     updates.ready_at     = now;
  if (newStatus === 'collected') updates.collected_at = now;
  if (newStatus === 'rejected') {
    updates.rejected_at   = now;
    updates.reject_reason = (body.reject_reason as string | undefined) ?? null;
  }

  const { data: updated, error: updateErr } = await supabase
    .from('online_orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  if (newStatus === 'accepted') {
    const { data: items } = await supabase
      .from('online_order_items')
      .select('product_id, qty')
      .eq('order_id', id);

    if (items) {
      for (const item of items) {
        await supabase.rpc('decrement_stock', {
          p_product_id: item.product_id,
          p_outlet_id: order.outlet_id,
          p_qty: item.qty,
        });
      }
    }
  }

  return NextResponse.json(updated);
}
