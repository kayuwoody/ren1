import { NextResponse } from 'next/server';
import { supabase } from '@/lib/online/supabase';
import { nextOrderNumber } from '@/lib/online/orderNumber';
import { isFiuuSuccess } from '@/lib/online/fiuu';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: {
    payment_ref: string;
    outlet_id?: string;
    pickup_type?: string;
    customer: { name: string; phone: string; fcm_token?: string };
    items: Array<{
      product_id: string;
      qty: number;
      unit_price: number;
      mods?: Record<string, string>;
    }>;
    total_paid: number;
    currency?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    payment_ref,
    outlet_id = 'main',
    pickup_type = 'counter',
    customer,
    items,
    total_paid,
    currency = 'MYR',
  } = body;

  if (!payment_ref || !customer?.name || !customer?.phone || !items?.length || total_paid == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!['counter', 'curbside'].includes(pickup_type)) {
    return NextResponse.json({ error: 'pickup_type must be counter or curbside' }, { status: 400 });
  }

  const { data: settings } = await supabase
    .from('outlet_settings')
    .select('intake_paused')
    .eq('outlet_id', outlet_id)
    .single();

  if (settings?.intake_paused) {
    return NextResponse.json(
      { error: 'Online ordering is temporarily paused. Please try again shortly.' },
      { status: 503 }
    );
  }

  const { data: payment, error: paymentErr } = await supabase
    .from('fiuu_payments')
    .select('payment_ref, order_id, status_code, amount')
    .eq('payment_ref', payment_ref)
    .single();

  if (paymentErr || !payment) {
    return NextResponse.json(
      { error: 'Payment reference not found. Please wait a moment and retry.' },
      { status: 402 }
    );
  }

  if (!isFiuuSuccess(payment.status_code)) {
    return NextResponse.json({ error: 'Payment was not successful' }, { status: 402 });
  }

  if (payment.order_id) {
    const { data: existing } = await supabase
      .from('online_orders')
      .select('id, status, created_at')
      .eq('id', payment.order_id)
      .single();
    if (existing) {
      return NextResponse.json(
        { order_id: existing.id, status: existing.status, eta_minutes: 4, created_at: existing.created_at },
        { status: 409 }
      );
    }
  }

  const productIds = items.map(i => i.product_id);

  const { data: products } = await supabase
    .from('online_products')
    .select('id, available, stock_count')
    .in('id', productIds)
    .eq('outlet_id', outlet_id);

  if (products) {
    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);
      if (product && !product.available) {
        return NextResponse.json({ error: `Item ${item.product_id} is currently unavailable` }, { status: 422 });
      }
      if (product && product.stock_count !== null && product.stock_count < item.qty) {
        return NextResponse.json({ error: `Insufficient stock for ${item.product_id}` }, { status: 422 });
      }
    }
  }

  let orderId: string;
  try {
    orderId = await nextOrderNumber();
  } catch (e: any) {
    console.error('[POST /api/orders] order number error:', e.message);
    return NextResponse.json({ error: 'Failed to generate order number' }, { status: 500 });
  }

  const now = new Date().toISOString();

  const { error: orderErr } = await supabase.from('online_orders').insert({
    id: orderId, payment_ref, outlet_id, status: 'pending', pickup_type,
    customer_name: customer.name, customer_phone: customer.phone,
    customer_fcm_token: customer.fcm_token ?? null,
    total_paid, currency, created_at: now, updated_at: now,
  });

  if (orderErr) {
    console.error('[POST /api/orders] insert error:', orderErr.message);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }

  const { data: catalogue } = await supabase.from('online_products').select('id, name').in('id', productIds);
  const nameMap = Object.fromEntries((catalogue ?? []).map(p => [p.id, p.name]));

  await supabase.from('online_order_items').insert(
    items.map(item => ({
      order_id: orderId, product_id: item.product_id,
      product_name: nameMap[item.product_id] ?? item.product_id,
      qty: item.qty, unit_price: item.unit_price, mods: item.mods ?? {},
    }))
  );

  await supabase.from('fiuu_payments').update({ order_id: orderId }).eq('payment_ref', payment_ref);

  return NextResponse.json({ order_id: orderId, status: 'pending', eta_minutes: 4, created_at: now }, { status: 201 });
}
