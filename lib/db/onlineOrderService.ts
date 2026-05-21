import { supabase } from '@/lib/supabase';

export interface OnlineOrderForReport {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  total: number;
  createdAt: string;
  source: 'online';
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
      online_order_items ( id, product_id, product_name, qty, unit_price )
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
      items: items.map(item => ({
        id: item.id,
        orderId: order.id,
        productId: item.product_id || '',
        productName: item.product_name || 'Unknown',
        quantity: item.qty,
        unitPrice: item.unit_price,
        finalPrice: item.unit_price,
        discountApplied: 0,
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
