/**
 * Order Service
 *
 * Centralized order queries from local SQLite database.
 * Replaces WooCommerce API calls for admin reporting routes.
 */

import { db } from './init';
import { v4 as uuidv4 } from 'uuid';

/* ------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------- */

export interface LocalOrder {
  id: string;
  wcId?: number;
  orderNumber: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  subtotal: number;
  tax: number;
  total: number;
  totalCost: number;
  totalProfit: number;
  overallMargin: number;
  paymentMethod?: string;
  notes?: string;
  branchId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  category: string;
  sku: string;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  subtotal: number;
  unitCost: number;
  totalCost: number;
  itemProfit: number;
  itemMargin: number;
  recipeSnapshot?: string;
  variations?: string;
  discountApplied: number;
  finalPrice: number;
  branchId: string;
  soldAt: string;
}

export interface OrderWithItems extends LocalOrder {
  items: LocalOrderItem[];
}

/* ------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------- */

function buildDateFilter(
  range: string,
  startDateParam?: string | null,
  endDateParam?: string | null,
): { startDate: string; endDate: string } {
  const now = new Date();
  const utc8Now = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const currentYear = utc8Now.getUTCFullYear();
  const currentMonth = utc8Now.getUTCMonth();
  const currentDay = utc8Now.getUTCDate();

  let startDate: Date;
  let endDate = new Date(Date.UTC(currentYear, currentMonth, currentDay, 23, 59, 59, 999) - (8 * 60 * 60 * 1000));

  if (startDateParam && endDateParam) {
    const startParts = startDateParam.split('-');
    const endParts = endDateParam.split('-');

    startDate = new Date(Date.UTC(
      parseInt(startParts[0]),
      parseInt(startParts[1]) - 1,
      parseInt(startParts[2]),
      0, 0, 0, 0
    ) - (8 * 60 * 60 * 1000));

    endDate = new Date(Date.UTC(
      parseInt(endParts[0]),
      parseInt(endParts[1]) - 1,
      parseInt(endParts[2]),
      23, 59, 59, 999
    ) - (8 * 60 * 60 * 1000));
  } else {
    switch (range) {
      case '7days':
        startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 7, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
        break;
      case '30days':
        startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 30, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
        break;
      case '90days':
        startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 90, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
        break;
      case 'mtd':
        startDate = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
        break;
      case 'ytd':
        startDate = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
        break;
      case 'all':
        startDate = new Date('2020-01-01');
        break;
      default:
        startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 7, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
    }
  }

  return {
    startDate: startDate!.toISOString(),
    endDate: endDate.toISOString(),
  };
}

/* ------------------------------------------------------------------
 * Query functions
 * ---------------------------------------------------------------- */

export function getOrders(opts: {
  branchId?: string;
  showAll?: boolean;
  statuses?: string[];
  after?: string;
  before?: string;
}): LocalOrder[] {
  let query = 'SELECT * FROM "Order" WHERE 1=1';
  const params: any[] = [];

  if (!opts.showAll && opts.branchId) {
    query += ' AND (branchId = ? OR branchId IS NULL)';
    params.push(opts.branchId);
  }

  if (opts.statuses && opts.statuses.length > 0) {
    const placeholders = opts.statuses.map(() => '?').join(', ');
    query += ` AND status IN (${placeholders})`;
    params.push(...opts.statuses);
  }

  if (opts.after) {
    query += ' AND createdAt >= ?';
    params.push(opts.after);
  }

  if (opts.before) {
    query += ' AND createdAt <= ?';
    params.push(opts.before);
  }

  query += ' ORDER BY createdAt DESC';

  return db.prepare(query).all(...params) as LocalOrder[];
}

export function getOrderItems(orderId: string): LocalOrderItem[] {
  return db.prepare(
    'SELECT * FROM OrderItem WHERE orderId = ? ORDER BY soldAt'
  ).all(orderId) as LocalOrderItem[];
}

export function getOrderWithItems(orderId: string): OrderWithItems | null {
  const order = db.prepare('SELECT * FROM "Order" WHERE id = ?').get(orderId) as LocalOrder | undefined;
  if (!order) return null;
  const items = getOrderItems(orderId);
  return { ...order, items };
}

export function getSaleOrders(opts: {
  branchId: string;
  range?: string;
  startDate?: string | null;
  endDate?: string | null;
  hideStaffMeals?: boolean;
}): OrderWithItems[] {
  const SALE_STATUSES = ['completed', 'processing', 'ready-for-pickup'];
  const { startDate, endDate } = buildDateFilter(
    opts.range || '7days',
    opts.startDate,
    opts.endDate,
  );

  let orders = getOrders({
    branchId: opts.branchId,
    statuses: SALE_STATUSES,
    after: startDate,
    before: endDate,
  });

  if (opts.hideStaffMeals) {
    orders = orders.filter(o => o.total > 0);
  }

  return orders.map(order => ({
    ...order,
    items: getOrderItems(order.id),
  }));
}

export function getDayOrders(opts: {
  branchId: string;
  date?: string;
}): OrderWithItems[] {
  let year: number, month: number, day: number;

  if (opts.date) {
    const parts = opts.date.split('-');
    year = parseInt(parts[0]);
    month = parseInt(parts[1]) - 1;
    day = parseInt(parts[2]);
  } else {
    const now = new Date();
    const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    year = utc8Time.getUTCFullYear();
    month = utc8Time.getUTCMonth();
    day = utc8Time.getUTCDate();
  }

  const startUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
  const endUTC = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - (8 * 60 * 60 * 1000));

  const SALE_STATUSES = ['completed', 'processing', 'ready-for-pickup'];

  const orders = getOrders({
    branchId: opts.branchId,
    statuses: SALE_STATUSES,
    after: startUTC.toISOString(),
    before: endUTC.toISOString(),
  });

  return orders.map(order => ({
    ...order,
    items: getOrderItems(order.id),
  }));
}

export function getDailyStats(branchId: string): {
  todayOrders: number;
  todayRevenue: number;
  itemsSold: number;
  pendingOrders: number;
} {
  const now = new Date();
  const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const year = utc8Time.getUTCFullYear();
  const month = utc8Time.getUTCMonth();
  const day = utc8Time.getUTCDate();

  const startUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
  const endUTC = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - (8 * 60 * 60 * 1000));

  const SALE_STATUSES = ['completed', 'processing', 'ready-for-pickup'];
  const statusPlaceholders = SALE_STATUSES.map(() => '?').join(', ');

  const todayResult = db.prepare(`
    SELECT
      COUNT(*) as orderCount,
      COALESCE(SUM(total), 0) as revenue
    FROM "Order"
    WHERE createdAt >= ? AND createdAt <= ?
      AND status IN (${statusPlaceholders})
      AND (branchId = ? OR branchId IS NULL)
  `).get(
    startUTC.toISOString(),
    endUTC.toISOString(),
    ...SALE_STATUSES,
    branchId,
  ) as { orderCount: number; revenue: number };

  const itemsResult = db.prepare(`
    SELECT COALESCE(SUM(oi.quantity), 0) as itemsSold
    FROM OrderItem oi
    JOIN "Order" o ON o.id = oi.orderId
    WHERE o.createdAt >= ? AND o.createdAt <= ?
      AND o.status IN (${statusPlaceholders})
      AND (o.branchId = ? OR o.branchId IS NULL)
  `).get(
    startUTC.toISOString(),
    endUTC.toISOString(),
    ...SALE_STATUSES,
    branchId,
  ) as { itemsSold: number };

  const pendingResult = db.prepare(`
    SELECT COUNT(*) as pendingCount
    FROM "Order"
    WHERE status IN ('pending', 'processing', 'on-hold')
      AND (branchId = ? OR branchId IS NULL)
  `).get(branchId) as { pendingCount: number };

  return {
    todayOrders: todayResult.orderCount,
    todayRevenue: todayResult.revenue,
    itemsSold: itemsResult.itemsSold,
    pendingOrders: pendingResult.pendingCount,
  };
}

/**
 * Save a WooCommerce order + its line items to the local Order/OrderItem tables.
 * Called at order creation time. Idempotent (upserts by wcId or id).
 */
export function saveOrderLocally(wooOrder: any, branchId: string): void {
  const insertOrder = db.transaction(() => {
    const now = new Date().toISOString();

    const getMeta = (metaData: any[] | undefined, key: string, fallback?: any) => {
      if (!metaData || !Array.isArray(metaData)) return fallback;
      const m = metaData.find((entry: any) => entry.key === key);
      return m?.value ?? fallback;
    };

    const orderId = String(wooOrder.id);
    const finalTotal = parseFloat(getMeta(wooOrder.meta_data, '_final_total', wooOrder.total) || '0');

    const existing = db.prepare('SELECT id FROM "Order" WHERE id = ? OR wcId = ?').get(orderId, wooOrder.id);

    if (existing) {
      db.prepare('UPDATE "Order" SET status = ?, updatedAt = ? WHERE id = ? OR wcId = ?')
        .run(wooOrder.status, now, orderId, wooOrder.id);
      return;
    }

    db.prepare(`
      INSERT INTO "Order" (id, wcId, orderNumber, status, customerName, customerPhone,
                           subtotal, tax, total, totalCost, totalProfit, overallMargin,
                           paymentMethod, notes, branchId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      wooOrder.id,
      wooOrder.number || String(wooOrder.id),
      wooOrder.status,
      wooOrder.billing?.first_name || 'Guest',
      wooOrder.billing?.phone || null,
      parseFloat(wooOrder.total) || 0,
      0,
      finalTotal,
      wooOrder.payment_method || null,
      wooOrder.customer_note || null,
      branchId,
      wooOrder.date_created || now,
      now,
    );

    const insertItem = db.prepare(`
      INSERT INTO OrderItem (id, orderId, productId, productName, category, sku,
                             quantity, basePrice, unitPrice, subtotal, unitCost, totalCost,
                             itemProfit, itemMargin, recipeSnapshot, variations,
                             discountApplied, finalPrice, branchId, soldAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of (wooOrder.line_items || [])) {
      const itemId = String(item.id);
      const finalPrice = parseFloat(getMeta(item.meta_data, '_final_price', item.price) || '0');
      const retailPrice = parseFloat(getMeta(item.meta_data, '_retail_price', item.price) || '0');
      const discountApplied = retailPrice > finalPrice ? retailPrice - finalPrice : 0;
      const isBundle = getMeta(item.meta_data, '_is_bundle') === 'true';
      const bundleDisplayName = getMeta(item.meta_data, '_bundle_display_name');
      const displayName = isBundle && bundleDisplayName ? bundleDisplayName : item.name;

      const variationsObj: Record<string, any> = {};
      if (isBundle) {
        variationsObj._is_bundle = 'true';
        variationsObj._bundle_display_name = bundleDisplayName;
        variationsObj._bundle_base_product_name = getMeta(item.meta_data, '_bundle_base_product_name');
        variationsObj._bundle_components = getMeta(item.meta_data, '_bundle_components');
      }
      const discountReason = getMeta(item.meta_data, '_discount_reason');
      if (discountReason) variationsObj._discount_reason = discountReason;
      variationsObj._retail_price = String(retailPrice);
      variationsObj._final_price = String(finalPrice);

      insertItem.run(
        itemId,
        orderId,
        String(item.product_id),
        displayName,
        '',
        item.sku || '',
        item.quantity,
        retailPrice,
        finalPrice,
        finalPrice * item.quantity,
        null,
        JSON.stringify(variationsObj),
        discountApplied,
        finalPrice,
        branchId,
        wooOrder.date_created || now,
      );
    }
  });
  insertOrder();
}
