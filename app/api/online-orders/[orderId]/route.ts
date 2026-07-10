import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { recordProductSale } from '@/lib/db/inventoryConsumptionService';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';

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
      .select('id, status, outlet_id, online_order_items ( id, product_id, product_name, qty, mods )')
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
      const branchId = 'branch-main';

      // Check if consumption already recorded (guard against double-accept)
      const existingConsumptions = getOrderConsumptions(orderId);

      for (const item of existing.online_order_items as any[]) {
        if (!item.product_id) continue;

        await supabase.rpc('decrement_stock', {
          p_product_id: item.product_id,
          p_outlet_id: 'main',
          p_qty: item.qty,
        });

        // Record COGS consumption in SQLite (skip if already recorded)
        if (existingConsumptions.length === 0) {
          // Map bubu1's mods → bundle selection so combo choices AND PWP add-ons
          // are consumed. combo_selections = XOR choices keyed by group uniqueKey;
          // selected_optionals = ticked add-ons ({ id, name }) for the chosen branch.
          const selectedMandatory: Record<string, string> = {};
          if (item.mods?.combo_selections) {
            const comboSels = item.mods.combo_selections as Record<string, { id?: string; name?: string }>;
            for (const [groupKey, sel] of Object.entries(comboSels)) {
              if (sel?.id) selectedMandatory[groupKey] = sel.id;
            }
          }
          const selectedOptional: string[] = Array.isArray(item.mods?.selected_optionals)
            ? (item.mods.selected_optionals as any[]).map((o) => o?.id).filter(Boolean)
            : [];

          const bundleSelection =
            Object.keys(selectedMandatory).length > 0 || selectedOptional.length > 0
              ? { selectedMandatory, selectedOptional }
              : undefined;

          try {
            await recordProductSale({
              orderId,
              wcProductId: item.product_id,
              productName: item.product_name || 'Unknown',
              quantitySold: item.qty,
              orderItemId: item.id,
              bundleSelection,
              branchId,
            });
            console.log(`📦 Recorded COGS for online item: ${item.product_name} x${item.qty}`);
          } catch (err) {
            console.error(`Failed to record COGS for online item ${item.id}:`, err);
          }
        }
      }
    }

    return NextResponse.json({ success: true, orderId, status: newStatus });
  } catch (err) {
    console.error('Online order update failed:', err);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
