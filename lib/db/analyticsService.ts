/**
 * Analytics Service
 * Transaction-level insights for profitability, trends, and decision-making
 */

import db from './init';

// ============================================================================
// Types
// ============================================================================

export interface ProfitabilityTrend {
  productId: string;
  productName: string;
  category: string;
  periodStart: string;
  periodEnd: string;
  totalSold: number;
  avgSoldPrice: number;
  avgCOGS: number;
  avgProfit: number;
  avgMargin: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface COGSTrend {
  productId: string;
  productName: string;
  date: string;
  avgCOGS: number;
  minCOGS: number;
  maxCOGS: number;
  totalSold: number;
}

export interface DiscountEffectiveness {
  discountId: string;
  discountName: string;
  discountType: string;
  timesUsed: number;
  totalSaved: number;
  totalRevenue: number;
  totalProfit: number;
  avgMargin: number;
  avgOrderValue: number;
}

export interface ProductComparison {
  productId: string;
  productName: string;
  category: string;
  totalSold: number;
  totalRevenue: number;
  avgUnitPrice: number;
  avgCOGS: number;
  totalProfit: number;
  avgMargin: number;
}

export interface PriceVsVolumeAnalysis {
  productId: string;
  productName: string;
  priceRange: string;
  unitsSold: number;
  totalRevenue: number;
  avgMargin: number;
}

// ============================================================================
// Profitability Trend Analysis
// ============================================================================

/**
 * Get profitability trend for products over time periods
 * Shows how profit changes as COGS fluctuates
 */
export function getProfitabilityTrend(
  startDate: string,
  endDate: string,
  groupBy: 'day' | 'week' | 'month' = 'week'
): ProfitabilityTrend[] {
  let dateFormat: string;
  switch (groupBy) {
    case 'day':
      dateFormat = '%Y-%m-%d';
      break;
    case 'week':
      dateFormat = '%Y-W%W';
      break;
    case 'month':
      dateFormat = '%Y-%m';
      break;
  }

  const stmt = db.prepare(`
    SELECT
      oi.productId,
      oi.productName,
      oi.category,
      strftime('${dateFormat}', oi.soldAt) as period,
      MIN(oi.soldAt) as periodStart,
      MAX(oi.soldAt) as periodEnd,
      SUM(oi.quantity) as totalSold,
      AVG(oi.unitPrice) as avgSoldPrice,
      AVG(oi.unitCost) as avgCOGS,
      AVG(oi.itemProfit / oi.quantity) as avgProfit,
      AVG(oi.itemMargin) as avgMargin,
      SUM(oi.finalPrice) as totalRevenue,
      SUM(oi.itemProfit) as totalProfit
    FROM OrderItem oi
    INNER JOIN "Order" o ON oi.orderId = o.id
    WHERE oi.soldAt >= ? AND oi.soldAt <= ?
      AND o.status NOT IN ('cancelled')
    GROUP BY oi.productId, oi.productName, oi.category, period
    ORDER BY period DESC, totalRevenue DESC
  `);

  return stmt.all(startDate, endDate) as ProfitabilityTrend[];
}

/**
 * Get COGS trend for a specific product
 * Shows how ingredient costs have changed over time
 */
export function getCOGSTrendForProduct(
  productId: string,
  startDate: string,
  endDate: string
): COGSTrend[] {
  const stmt = db.prepare(`
    SELECT
      oi.productId,
      oi.productName,
      DATE(oi.soldAt) as date,
      AVG(oi.unitCost) as avgCOGS,
      MIN(oi.unitCost) as minCOGS,
      MAX(oi.unitCost) as maxCOGS,
      SUM(oi.quantity) as totalSold
    FROM OrderItem oi
    INNER JOIN "Order" o ON oi.orderId = o.id
    WHERE oi.productId = ?
      AND oi.soldAt >= ? AND oi.soldAt <= ?
      AND o.status NOT IN ('cancelled')
    GROUP BY oi.productId, oi.productName, DATE(oi.soldAt)
    ORDER BY date ASC
  `);

  return stmt.all(productId, startDate, endDate) as COGSTrend[];
}

// ============================================================================
// Discount & Combo Analysis
// ============================================================================

/**
 * Analyze discount/combo effectiveness
 * Shows which promotions drive best margins and revenue
 */
export function getDiscountEffectiveness(
  startDate: string,
  endDate: string
): DiscountEffectiveness[] {
  const stmt = db.prepare(`
    SELECT
      ad.discountId,
      ad.discountName,
      ad.type as discountType,
      COUNT(DISTINCT ad.orderId) as timesUsed,
      SUM(ad.amountSaved) as totalSaved,
      SUM(o.total) as totalRevenue,
      SUM(o.grossProfit) as totalProfit,
      AVG(o.grossMargin) as avgMargin,
      AVG(o.total) as avgOrderValue
    FROM AppliedDiscount ad
    INNER JOIN "Order" o ON ad.orderId = o.id
    WHERE o.createdAt >= ? AND o.createdAt <= ?
      AND o.status NOT IN ('cancelled')
    GROUP BY ad.discountId, ad.discountName, ad.type
    ORDER BY totalRevenue DESC
  `);

  return stmt.all(startDate, endDate) as DiscountEffectiveness[];
}

/**
 * Compare orders with vs without discounts
 */
export function getDiscountImpact(
  startDate: string,
  endDate: string
): {
  withDiscount: { orders: number; avgMargin: number; avgOrderValue: number };
  withoutDiscount: { orders: number; avgMargin: number; avgOrderValue: number };
} {
  const withDiscount = db.prepare(`
    SELECT
      COUNT(*) as orders,
      AVG(grossMargin) as avgMargin,
      AVG(total) as avgOrderValue
    FROM "Order"
    WHERE totalDiscount > 0
      AND createdAt >= ? AND createdAt <= ?
      AND status NOT IN ('cancelled')
  `).get(startDate, endDate) as any;

  const withoutDiscount = db.prepare(`
    SELECT
      COUNT(*) as orders,
      AVG(grossMargin) as avgMargin,
      AVG(total) as avgOrderValue
    FROM "Order"
    WHERE totalDiscount = 0
      AND createdAt >= ? AND createdAt <= ?
      AND status NOT IN ('cancelled')
  `).get(startDate, endDate) as any;

  return {
    withDiscount: {
      orders: withDiscount.orders || 0,
      avgMargin: withDiscount.avgMargin || 0,
      avgOrderValue: withDiscount.avgOrderValue || 0,
    },
    withoutDiscount: {
      orders: withoutDiscount.orders || 0,
      avgMargin: withoutDiscount.avgMargin || 0,
      avgOrderValue: withoutDiscount.avgOrderValue || 0,
    },
  };
}

// ============================================================================
// Product Performance Comparison
// ============================================================================

/**
 * Compare product performance
 * Identify which products are most/least profitable
 */
export function compareProducts(
  startDate: string,
  endDate: string,
  category?: string
): ProductComparison[] {
  let query = `
    SELECT
      oi.productId,
      oi.productName,
      oi.category,
      SUM(oi.quantity) as totalSold,
      SUM(oi.finalPrice) as totalRevenue,
      AVG(oi.unitPrice) as avgUnitPrice,
      AVG(oi.unitCost) as avgCOGS,
      SUM(oi.itemProfit) as totalProfit,
      AVG(oi.itemMargin) as avgMargin
    FROM OrderItem oi
    INNER JOIN "Order" o ON oi.orderId = o.id
    WHERE oi.soldAt >= ? AND oi.soldAt <= ?
      AND o.status NOT IN ('cancelled')
  `;

  const params: any[] = [startDate, endDate];

  if (category) {
    query += ' AND oi.category = ?';
    params.push(category);
  }

  query += `
    GROUP BY oi.productId, oi.productName, oi.category
    ORDER BY totalProfit DESC
  `;

  const stmt = db.prepare(query);
  return stmt.all(...params) as ProductComparison[];
}

/**
 * Identify products with declining margins
 * Flags products becoming less profitable over time
 */
export function getProductsWithDecliningMargins(
  daysToCompare: number = 30
): Array<{
  productId: string;
  productName: string;
  recentMargin: number;
  previousMargin: number;
  marginChange: number;
  recentCOGS: number;
  previousCOGS: number;
  cogsChange: number;
}> {
  const recentStart = new Date();
  recentStart.setDate(recentStart.getDate() - daysToCompare);
  const previousStart = new Date();
  previousStart.setDate(previousStart.getDate() - daysToCompare * 2);
  const previousEnd = new Date();
  previousEnd.setDate(previousEnd.getDate() - daysToCompare);

  const stmt = db.prepare(`
    WITH RecentData AS (
      SELECT
        productId,
        productName,
        AVG(itemMargin) as recentMargin,
        AVG(unitCost) as recentCOGS
      FROM OrderItem
      WHERE soldAt >= ?
      GROUP BY productId, productName
    ),
    PreviousData AS (
      SELECT
        productId,
        AVG(itemMargin) as previousMargin,
        AVG(unitCost) as previousCOGS
      FROM OrderItem
      WHERE soldAt >= ? AND soldAt < ?
      GROUP BY productId
    )
    SELECT
      r.productId,
      r.productName,
      r.recentMargin,
      COALESCE(p.previousMargin, r.recentMargin) as previousMargin,
      r.recentMargin - COALESCE(p.previousMargin, r.recentMargin) as marginChange,
      r.recentCOGS,
      COALESCE(p.previousCOGS, r.recentCOGS) as previousCOGS,
      r.recentCOGS - COALESCE(p.previousCOGS, r.recentCOGS) as cogsChange
    FROM RecentData r
    LEFT JOIN PreviousData p ON r.productId = p.productId
    WHERE r.recentMargin < COALESCE(p.previousMargin, r.recentMargin)
    ORDER BY marginChange ASC
  `);

  return stmt.all(
    recentStart.toISOString(),
    previousStart.toISOString(),
    previousEnd.toISOString()
  ) as any[];
}

// ============================================================================
// Price Sensitivity Analysis
// ============================================================================

/**
 * Analyze how price changes affect volume and margin
 * Shows if products sold at different prices than base price
 */
export function analyzePriceSensitivity(
  productId: string,
  startDate: string,
  endDate: string
): PriceVsVolumeAnalysis[] {
  const stmt = db.prepare(`
    SELECT
      productId,
      productName,
      CASE
        WHEN unitPrice = basePrice THEN 'Regular Price'
        WHEN unitPrice < basePrice THEN 'Discounted'
        ELSE 'Premium'
      END as priceRange,
      SUM(quantity) as unitsSold,
      SUM(finalPrice) as totalRevenue,
      AVG(itemMargin) as avgMargin
    FROM OrderItem
    WHERE productId = ?
      AND soldAt >= ? AND soldAt <= ?
    GROUP BY productId, productName, priceRange
    ORDER BY priceRange
  `);

  return stmt.all(productId, startDate, endDate) as PriceVsVolumeAnalysis[];
}

// ============================================================================
// Category Performance
// ============================================================================

/**
 * Get category-level insights
 */
export function getCategoryPerformance(
  startDate: string,
  endDate: string
): Array<{
  category: string;
  totalSold: number;
  totalRevenue: number;
  totalProfit: number;
  avgMargin: number;
  uniqueProducts: number;
}> {
  const stmt = db.prepare(`
    SELECT
      oi.category,
      SUM(oi.quantity) as totalSold,
      SUM(oi.finalPrice) as totalRevenue,
      SUM(oi.itemProfit) as totalProfit,
      AVG(oi.itemMargin) as avgMargin,
      COUNT(DISTINCT oi.productId) as uniqueProducts
    FROM OrderItem oi
    INNER JOIN "Order" o ON oi.orderId = o.id
    WHERE oi.soldAt >= ? AND oi.soldAt <= ?
      AND o.status NOT IN ('cancelled')
    GROUP BY oi.category
    ORDER BY totalProfit DESC
  `);

  return stmt.all(startDate, endDate) as any[];
}

// ============================================================================
// Best Combo Recommendations
// ============================================================================

/**
 * Find products frequently bought together
 * Useful for creating combo deals
 */
export function findFrequentPairs(
  minOccurrences: number = 5,
  startDate?: string,
  endDate?: string
): Array<{
  product1Id: string;
  product1Name: string;
  product2Id: string;
  product2Name: string;
  timesBoughtTogether: number;
  avgCombinedMargin: number;
}> {
  let query = `
    SELECT
      oi1.productId as product1Id,
      oi1.productName as product1Name,
      oi2.productId as product2Id,
      oi2.productName as product2Name,
      COUNT(DISTINCT oi1.orderId) as timesBoughtTogether,
      AVG((oi1.itemMargin + oi2.itemMargin) / 2) as avgCombinedMargin
    FROM OrderItem oi1
    INNER JOIN OrderItem oi2 ON oi1.orderId = oi2.orderId AND oi1.productId < oi2.productId
    INNER JOIN "Order" o ON oi1.orderId = o.id
    WHERE o.status NOT IN ('cancelled')
  `;

  const params: any[] = [];

  if (startDate && endDate) {
    query += ' AND oi1.soldAt >= ? AND oi1.soldAt <= ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY oi1.productId, oi1.productName, oi2.productId, oi2.productName
    HAVING COUNT(DISTINCT oi1.orderId) >= ?
    ORDER BY timesBoughtTogether DESC, avgCombinedMargin DESC
  `;

  params.push(minOccurrences);

  const stmt = db.prepare(query);
  return stmt.all(...params) as any[];
}
