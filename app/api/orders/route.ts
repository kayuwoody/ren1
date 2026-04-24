import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db/init';
import { handleApiError } from '@/lib/api/error-handler';
import { getOrderItems } from '@/lib/db/orderService';
import { supabase } from '@/lib/online/supabase';
import { nextOrderNumber } from '@/lib/online/orderNumber';
import { isFiuuSuccess } from '@/lib/online/fiuu';

export const dynamic = 'force-dynamic';

function toNum(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const guestId = sp.get('guestId') || undefined;
    const status = sp.get('status') || undefined;
    const page = toNum(sp.get('page'), 1);
    const perPage = toNum(sp.get('per_page'), 50);

    const userIdCookie = (await cookies()).get('userId')?.value;

    let query = 'SELECT * FROM "Order" WHERE 1=1';
    const params: any[] = [];

    if (userIdCookie) {
      query += ' AND customerId = ?';
      params.push(userIdCookie);
    } else if (guestId) {
      query += ' AND guestId = ?';
      params.push(guestId);
    } else {
      return NextResponse.json([]);
    }

    if (status) {
      const statuses = status.split(',');
      query += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }

    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(perPage, (page - 1) * perPage);

    const orders = db.prepare(query).all(...params) as any[];

    const result = orders.map(order => {
      const items = getOrderItems(order.id);
      return {
        id: order.id,
        number: order.orderNumber,
        status: order.status,
        total: String(order.total),
        date_created: order.createdAt,
        billing: { first_name: order.customerName || 'Guest', phone: order.customerPhone || '' },
        line_items: items.map(item => ({
          id: item.id,
          product_id: item.productId,
          name: item.productName,
          quantity: item.quantity,
          price: item.finalPrice,
          total: String(item.subtotal),
        })),
        meta_data: [
          { key: '_branch_id', value: order.branchId || '' },
          ...(order.startTime ? [{ key: 'startTime', value: order.startTime }] : []),
          ...(order.endTime ? [{ key: 'endTime', value: order.endTime }] : []),
          ...(order.lockerNumber ? [{ key: '_locker_number', value: order.lockerNumber }] : []),
          ...(order.pickupCode ? [{ key: '_pickup_code', value: order.pickupCode }] : []),
        ],
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, '/api/orders');
  }
}

// ── POST /api/orders ─────────────────────────────────────────────────────────
// Called by the customer app after Fiuu payment is confirmed.
// Idempotent on payment_ref (tranID from Fiuu).
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

  const { payment_ref, outlet_id = 'main', pickup_type = 'counter', customer, items, total_paid, currency = 'MYR' } = body;

  // Basic validation
  if (!payment_ref || !customer?.name || !customer?.phone || !items?.length || total_paid == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!['counter', 'curbside'].includes(pickup_type)) {
    return NextResponse.json({ error: 'pickup_type must be counter or curbside' }, { status: 400 });
  }

  // Check intake pause
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

  // Verify payment ref was confirmed by Fiuu webhook
  const { data: payment, error: paymentErr } = await supabase
    .from('fiuu_payments')
    .select('payment_ref, order_id, status_code, amount')
    .eq('payment_ref', payment_ref)
    .single();

  if (paymentErr || !payment) {
    return NextResponse.json(
      { error: 'Payment reference not found. Ensure the Fiuu webhook has been received.' },
      { status: 402 }
    );
  }

  if (!isFiuuSuccess(payment.status_code)) {
    return NextResponse.json({ error: 'Payment was not successful' }, { status: 402 });
  }

  // Idempotency: return existing order if payment_ref already linked
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

  // Stock check for limited-stock products
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
        return NextResponse.json(
          { error: `Item ${item.product_id} is currently unavailable` },
          { status: 422 }
        );
      }
      if (product && product.stock_count !== null && product.stock_count < item.qty) {
        return NextResponse.json(
          { error: `Insufficient stock for ${item.product_id}` },
          { status: 422 }
        );
      }
    }
  }

  // Generate order number and create order
  let orderId: string;
  try {
    orderId = await nextOrderNumber();
  } catch (e: any) {
    console.error('[POST /api/orders] order number error:', e.message);
    return NextResponse.json({ error: 'Failed to generate order number' }, { status: 500 });
  }

  const now = new Date().toISOString();

  const { error: orderErr } = await supabase.from('online_orders').insert({
    id: orderId,
    payment_ref,
    outlet_id,
    status: 'pending',
    pickup_type,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_fcm_token: customer.fcm_token ?? null,
    total_paid,
    currency,
    created_at: now,
    updated_at: now,
  });

  if (orderErr) {
    console.error('[POST /api/orders] insert order error:', orderErr.message);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }

  // Look up product names from catalogue
  const { data: catalogue } = await supabase
    .from('online_products')
    .select('id, name')
    .in('id', productIds);

  const nameMap = Object.fromEntries((catalogue ?? []).map(p => [p.id, p.name]));

  const itemRows = items.map(item => ({
    order_id: orderId,
    product_id: item.product_id,
    product_name: nameMap[item.product_id] ?? item.product_id,
    qty: item.qty,
    unit_price: item.unit_price,
    mods: item.mods ?? {},
  }));

  const { error: itemsErr } = await supabase.from('online_order_items').insert(itemRows);
  if (itemsErr) {
    console.error('[POST /api/orders] insert items error:', itemsErr.message);
    // Order is created; items failure is non-fatal but logged
  }

  // Backfill payment_ref → order_id link
  await supabase
    .from('fiuu_payments')
    .update({ order_id: orderId })
    .eq('payment_ref', payment_ref);

  return NextResponse.json(
    { order_id: orderId, status: 'pending', eta_minutes: 4, created_at: now },
    { status: 201 }
  );
}
