import { NextResponse } from 'next/server';
import { supabase } from '@/lib/online/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/online/products/:id/stock
 * POS calls this to sync availability and stock counts to the cloud.
 *
 * Body variants:
 *   { "available": false }                     — manual sold-out toggle
 *   { "stock_count": 3 }                       — absolute count update
 *   { "decrement": 1 }                         — relative decrement
 *   { "outlet_id": "main", "available": true } — outlet-scoped update
 *
 * Can also upsert a product's full record (name, category, price, image_url)
 * for the initial sync from POS → cloud catalogue.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  let body: {
    outlet_id?: string;
    available?: boolean;
    stock_count?: number;
    decrement?: number;
    // Full product fields for upsert
    name?: string;
    category?: string;
    price?: number;
    image_url?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const outlet = body.outlet_id ?? 'main';
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.available !== undefined) updates.available = body.available;
  if (body.stock_count !== undefined) updates.stock_count = Math.max(0, body.stock_count);
  if (body.name !== undefined) updates.name = body.name;
  if (body.category !== undefined) updates.category = body.category;
  if (body.price !== undefined) updates.price = body.price;
  if (body.image_url !== undefined) updates.image_url = body.image_url;

  // Relative decrement — use the DB function to avoid races
  if (body.decrement !== undefined && body.decrement > 0) {
    const { error } = await supabase.rpc('decrement_stock', {
      p_product_id: id,
      p_outlet_id: outlet,
      p_qty: body.decrement,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Also apply any other field updates if present alongside decrement
    if (Object.keys(updates).length === 1) {
      const { data } = await supabase
        .from('online_products')
        .select('id, available, stock_count')
        .eq('id', id)
        .eq('outlet_id', outlet)
        .single();
      return NextResponse.json(data ?? { id });
    }
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('online_products')
    .upsert({ id, outlet_id: outlet, ...updates }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
