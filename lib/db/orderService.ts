/**
 * Order Database Service
 * Handles all order-related database operations including profit tracking
 */

import db from './init';
import { v4 as uuidv4 } from 'uuid';
import { getProduct, recordStockMovement } from './productService';

// ============================================================================
// Types
// ============================================================================

export interface Order {
  id: string;
  woocommerceId?: number;
  orderNumber: string;
  customerId?: string;
  customerEmail?: string;
  subtotal: number;
  totalDiscount: number;
  tax: number;
  total: number;
  totalCOGS: number;
  grossProfit: number;
  grossMargin: number;
  paymentMethod: string;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  status: 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';
  lockerSlot?: string;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  unitCost: number;
  totalCost: number;
  itemProfit: number;
  itemMargin: number;
  variations?: any;
  discountApplied: number;
  finalPrice: number;
}

export interface CreateOrderInput {
  woocommerceId?: number;
  orderNumber: string;
  customerId?: string;
  customerEmail?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    variations?: any;
    discountApplied?: number;
  }>;
  totalDiscount?: number;
  tax?: number;
  paymentMethod: string;
  paymentStatus?: 'pending' | 'paid' | 'refunded';
  status?: 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';
  lockerSlot?: string;
}

// ============================================================================
// Order CRUD Operations
// ============================================================================

/**
 * Create a new order with automatic profit calculations
 */
export function createOrder(input: CreateOrderInput): Order {
  const orderId = uuidv4();
  const now = new Date().toISOString();

  // Calculate totals from items
  let subtotal = 0;
  let totalCOGS = 0;
  const orderItems: OrderItem[] = [];

  // Process each item
  for (const item of input.items) {
    const product = getProduct(item.productId);
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }

    const itemId = uuidv4();
    const itemSubtotal = item.unitPrice * item.quantity;
    const itemTotalCost = product.unitCost * item.quantity;
    const discountApplied = item.discountApplied || 0;
    const finalPrice = itemSubtotal - discountApplied;
    const itemProfit = finalPrice - itemTotalCost;
    const itemMargin = finalPrice > 0 ? (itemProfit / finalPrice) * 100 : 0;

    subtotal += itemSubtotal;
    totalCOGS += itemTotalCost;

    orderItems.push({
      id: itemId,
      orderId,
      productId: item.productId,
      productName: product.name,
      sku: product.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: itemSubtotal,
      unitCost: product.unitCost,
      totalCost: itemTotalCost,
      itemProfit,
      itemMargin,
      variations: item.variations,
      discountApplied,
      finalPrice,
    });
  }

  const totalDiscount = input.totalDiscount || 0;
  const tax = input.tax || 0;
  const total = subtotal - totalDiscount + tax;
  const grossProfit = total - totalCOGS;
  const grossMargin = total > 0 ? (grossProfit / total) * 100 : 0;

  // Start transaction
  const insertOrder = db.transaction(() => {
    // Insert order
    const orderStmt = db.prepare(`
      INSERT INTO "Order" (
        id, woocommerceId, orderNumber, customerId, customerEmail,
        subtotal, totalDiscount, tax, total,
        totalCOGS, grossProfit, grossMargin,
        paymentMethod, paymentStatus, status, lockerSlot, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    orderStmt.run(
      orderId,
      input.woocommerceId || null,
      input.orderNumber,
      input.customerId || null,
      input.customerEmail || null,
      subtotal,
      totalDiscount,
      tax,
      total,
      totalCOGS,
      grossProfit,
      grossMargin,
      input.paymentMethod,
      input.paymentStatus || 'pending',
      input.status || 'pending',
      input.lockerSlot || null,
      now
    );

    // Insert order items
    const itemStmt = db.prepare(`
      INSERT INTO OrderItem (
        id, orderId, productId, productName, sku,
        quantity, unitPrice, subtotal,
        unitCost, totalCost, itemProfit, itemMargin,
        variations, discountApplied, finalPrice
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of orderItems) {
      itemStmt.run(
        item.id,
        item.orderId,
        item.productId,
        item.productName,
        item.sku,
        item.quantity,
        item.unitPrice,
        item.subtotal,
        item.unitCost,
        item.totalCost,
        item.itemProfit,
        item.itemMargin,
        item.variations ? JSON.stringify(item.variations) : null,
        item.discountApplied,
        item.finalPrice
      );

      // Record stock movement for each item
      const product = getProduct(item.productId)!;
      recordStockMovement({
        productId: item.productId,
        type: 'sale',
        quantity: -item.quantity,
        previousStock: product.stockQuantity,
        newStock: product.stockQuantity - item.quantity,
        orderId,
        performedBy: 'system',
      });
    }
  });

  insertOrder();

  return getOrder(orderId)!;
}

/**
 * Get order by ID
 */
export function getOrder(id: string): Order | null {
  const stmt = db.prepare('SELECT * FROM "Order" WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) return null;

  return row as Order;
}

/**
 * Get order by WooCommerce ID
 */
export function getOrderByWooId(woocommerceId: number): Order | null {
  const stmt = db.prepare('SELECT * FROM "Order" WHERE woocommerceId = ?');
  const row = stmt.get(woocommerceId) as any;

  if (!row) return null;

  return row as Order;
}

/**
 * Get order by order number
 */
export function getOrderByNumber(orderNumber: string): Order | null {
  const stmt = db.prepare('SELECT * FROM "Order" WHERE orderNumber = ?');
  const row = stmt.get(orderNumber) as any;

  if (!row) return null;

  return row as Order;
}

/**
 * Get order items
 */
export function getOrderItems(orderId: string): OrderItem[] {
  const stmt = db.prepare('SELECT * FROM OrderItem WHERE orderId = ?');
  const rows = stmt.all(orderId) as any[];

  return rows.map(row => ({
    ...row,
    variations: row.variations ? JSON.parse(row.variations) : undefined,
  }));
}

/**
 * Get order with items
 */
export function getOrderWithItems(orderId: string): (Order & { items: OrderItem[] }) | null {
  const order = getOrder(orderId);
  if (!order) return null;

  const items = getOrderItems(orderId);

  return {
    ...order,
    items,
  };
}

/**
 * Update order status
 */
export function updateOrderStatus(
  orderId: string,
  status: Order['status'],
  additionalFields?: {
    lockerSlot?: string;
    completedAt?: string;
    cancelledAt?: string;
  }
): void {
  let query = 'UPDATE "Order" SET status = ?';
  const params: any[] = [status];

  if (additionalFields?.lockerSlot) {
    query += ', lockerSlot = ?';
    params.push(additionalFields.lockerSlot);
  }

  if (additionalFields?.completedAt) {
    query += ', completedAt = ?';
    params.push(additionalFields.completedAt);
  }

  if (additionalFields?.cancelledAt) {
    query += ', cancelledAt = ?';
    params.push(additionalFields.cancelledAt);
  }

  query += ' WHERE id = ?';
  params.push(orderId);

  const stmt = db.prepare(query);
  stmt.run(...params);
}

/**
 * List orders by customer
 */
export function listOrdersByCustomer(
  customerId: string,
  limit: number = 50
): Order[] {
  const stmt = db.prepare(`
    SELECT * FROM "Order"
    WHERE customerId = ?
    ORDER BY createdAt DESC
    LIMIT ?
  `);

  return stmt.all(customerId, limit) as Order[];
}

/**
 * List orders by status
 */
export function listOrdersByStatus(
  status: Order['status'],
  limit: number = 50
): Order[] {
  const stmt = db.prepare(`
    SELECT * FROM "Order"
    WHERE status = ?
    ORDER BY createdAt DESC
    LIMIT ?
  `);

  return stmt.all(status, limit) as Order[];
}

/**
 * List orders by date range
 */
export function listOrdersByDateRange(
  startDate: string,
  endDate: string
): Order[] {
  const stmt = db.prepare(`
    SELECT * FROM "Order"
    WHERE createdAt >= ? AND createdAt <= ?
    ORDER BY createdAt DESC
  `);

  return stmt.all(startDate, endDate) as Order[];
}

/**
 * Get order statistics for a date range
 */
export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  totalCOGS: number;
  totalProfit: number;
  averageOrderValue: number;
  averageMargin: number;
}

export function getOrderStats(startDate: string, endDate: string): OrderStats {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as totalOrders,
      SUM(total) as totalRevenue,
      SUM(totalCOGS) as totalCOGS,
      SUM(grossProfit) as totalProfit,
      AVG(total) as averageOrderValue,
      AVG(grossMargin) as averageMargin
    FROM "Order"
    WHERE createdAt >= ? AND createdAt <= ?
      AND status NOT IN ('cancelled')
  `);

  const result = stmt.get(startDate, endDate) as any;

  return {
    totalOrders: result.totalOrders || 0,
    totalRevenue: result.totalRevenue || 0,
    totalCOGS: result.totalCOGS || 0,
    totalProfit: result.totalProfit || 0,
    averageOrderValue: result.averageOrderValue || 0,
    averageMargin: result.averageMargin || 0,
  };
}

/**
 * Get top selling products
 */
export interface TopProduct {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  totalProfit: number;
}

export function getTopProducts(
  startDate: string,
  endDate: string,
  limit: number = 10
): TopProduct[] {
  const stmt = db.prepare(`
    SELECT
      oi.productId,
      oi.productName,
      SUM(oi.quantity) as totalQuantity,
      SUM(oi.finalPrice) as totalRevenue,
      SUM(oi.itemProfit) as totalProfit
    FROM OrderItem oi
    INNER JOIN "Order" o ON oi.orderId = o.id
    WHERE o.createdAt >= ? AND o.createdAt <= ?
      AND o.status NOT IN ('cancelled')
    GROUP BY oi.productId, oi.productName
    ORDER BY totalQuantity DESC
    LIMIT ?
  `);

  return stmt.all(startDate, endDate, limit) as TopProduct[];
}
