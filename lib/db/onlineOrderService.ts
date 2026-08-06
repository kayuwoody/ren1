import { supabase } from '@/lib/supabase';

export interface OnlineOrderForReport {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  total: number;
  createdAt: string;
  source: 'online';
  voucherCode: string | null;
  voucherDiscount: number;
  passCode: string | null;
  passDiscount: number;
  items: OnlineOrderItemForReport[];
}

export interface OnlineOrderItemForReport {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  finalPrice: number;
  discountApplied: number;
  isBundle: boolean;
  components: Array<{ productId: string; productName: string; quantity: number }>;
}

/**
 * Extract combo/bundle component names from an online_order_items `mods` blob.
 * bubu1 stores XOR picks under `mods.combo_selections` ({ group: { id, name } })
 * and add-ons under `mods.selected_optionals` ([{ id, name }]).
 */
function componentsFromMods(
  mods: any,
  quantity: number,
): Array<{ productId: string; productName: string; quantity: number }> {
  if (!mods || typeof mods !== 'object') return [];

  const picks: Array<{ id?: string; name?: string }> = [];

  if (mods.combo_selections && typeof mods.combo_selections === 'object') {
    picks.push(...Object.values(mods.combo_selections as Record<string, { id?: string; name?: string }>));
  }
  if (Array.isArray(mods.selected_optionals)) {
    picks.push(...(mods.selected_optionals as Array<{ id?: string; name?: string }>));
  }

  return picks
    .filter((c) => c && (c.name || c.id))
    .map((c) => ({ productId: c.id || '', productName: c.name || 'Item', quantity }));
}

export async function getCollectedOnlineOrders(opts: {
  startDate: string;
  endDate: string;
  outletId?: string;
}): Promise<OnlineOrderForReport[]> {
  const { data, error } = await supabase
    .from('online_orders')
    .select(`
      id, status, customer_name, total_paid, created_at,
      voucher_code, voucher_discount, pass_code, pass_discount,
      online_order_items ( id, product_id, product_name, qty, unit_price, mods )
    `)
    .eq('status', 'collected')
    .eq('outlet_id', opts.outletId || 'main')
    .gte('created_at', opts.startDate)
    .lte('created_at', opts.endDate)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Failed to fetch online orders for report:', error);
    return [];
  }

  return data.map(order => {
    const items = (order.online_order_items ?? []) as any[];
    return {
      id: order.id,
      orderNumber: `ONL-${order.id.slice(0, 6).toUpperCase()}`,
      status: 'collected',
      customerName: order.customer_name || 'Online Customer',
      total: order.total_paid,
      createdAt: order.created_at,
      source: 'online' as const,
      voucherCode: order.voucher_code ?? null,
      voucherDiscount: Number(order.voucher_discount) || 0,
      passCode: order.pass_code ?? null,
      passDiscount: Number(order.pass_discount) || 0,
      items: items.map(item => {
        const components = componentsFromMods(item.mods, item.qty);
        return {
          id: item.id,
          orderId: order.id,
          productId: item.product_id || '',
          productName: item.product_name || 'Unknown',
          quantity: item.qty,
          unitPrice: item.unit_price,
          finalPrice: item.unit_price,
          discountApplied: 0,
          isBundle: components.length > 0,
          components,
        };
      }),
    };
  });
}

/**
 * Fetch online orders of ANY status for the order-management page.
 * Newest first, capped for safety. Includes customer phone for the billing row.
 */
export async function getAllOnlineOrders(opts?: { outletId?: string; limit?: number }): Promise<Array<{
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  total: number;
  createdAt: string;
  voucherCode: string | null;
  voucherDiscount: number;
  passCode: string | null;
  passDiscount: number;
  items: { id: string; productId: string; productName: string; quantity: number; unitPrice: number }[];
}>> {
  const { data, error } = await supabase
    .from('online_orders')
    .select(`
      id, status, customer_name, customer_phone, total_paid, created_at,
      voucher_code, voucher_discount, pass_code, pass_discount,
      online_order_items ( id, product_id, product_name, qty, unit_price )
    `)
    .eq('outlet_id', opts?.outletId || 'main')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 500);

  if (error || !data) {
    console.error('Failed to fetch online orders:', error);
    return [];
  }

  return data.map(order => {
    const items = (order.online_order_items ?? []) as any[];
    return {
      id: order.id,
      orderNumber: `ONL-${order.id.slice(0, 6).toUpperCase()}`,
      status: order.status,
      customerName: order.customer_name || 'Online Customer',
      customerPhone: order.customer_phone || '',
      total: order.total_paid,
      createdAt: order.created_at,
      voucherCode: order.voucher_code ?? null,
      voucherDiscount: Number(order.voucher_discount) || 0,
      passCode: order.pass_code ?? null,
      passDiscount: Number(order.pass_discount) || 0,
      items: items.map(item => ({
        id: item.id,
        productId: item.product_id || '',
        productName: item.product_name || 'Unknown',
        quantity: item.qty,
        unitPrice: item.unit_price,
      })),
    };
  });
}

export async function getOnlineDailyStats(outletId: string = 'main'): Promise<{
  orderCount: number;
  revenue: number;
  itemsSold: number;
  pendingCount: number;
}> {
  const now = new Date();
  const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const year = utc8Time.getUTCFullYear();
  const month = utc8Time.getUTCMonth();
  const day = utc8Time.getUTCDate();

  const startUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
  const endUTC = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - (8 * 60 * 60 * 1000));

  const [collectedRes, pendingRes] = await Promise.all([
    supabase
      .from('online_orders')
      .select('id, total_paid, online_order_items ( qty )')
      .eq('status', 'collected')
      .eq('outlet_id', outletId)
      .gte('created_at', startUTC.toISOString())
      .lte('created_at', endUTC.toISOString()),
    supabase
      .from('online_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'accepted', 'ready'])
      .eq('outlet_id', outletId),
  ]);

  const collected = collectedRes.data ?? [];
  let revenue = 0;
  let itemsSold = 0;
  for (const order of collected) {
    revenue += order.total_paid || 0;
    const items = (order.online_order_items ?? []) as any[];
    for (const item of items) {
      itemsSold += item.qty || 0;
    }
  }

  return {
    orderCount: collected.length,
    revenue,
    itemsSold,
    pendingCount: pendingRes.count ?? 0,
  };
}
