import { NextResponse } from 'next/server';
import { getSaleOrders, parseItemVariations, buildDateFilter } from '@/lib/db/orderService';
import { getCollectedOnlineOrders } from '@/lib/db/onlineOrderService';
import { getProduct } from '@/lib/db/productService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

interface CategoryStat {
  category: string;
  quantity: number;
  revenue: number;
}

/**
 * Category breakdown: items sold and revenue per product category, with each
 * category's share of the totals.
 *
 * Two modes (via `expanded`):
 *  - grouped (default): each sold line counts once under its own product's
 *    category. A combo counts once under "combo".
 *  - expanded: POS combos are decomposed into their components, so each
 *    component counts under ITS category (the coffee under coffee, the danish
 *    under pastry) and the "combo" bucket disappears. Revenue is split across
 *    the components by base price, so totals stay conserved.
 *
 * Online combos are NOT decomposed: bubu1 only stores the customer's choices in
 * `mods` (which include non-product modifiers like "Hot"), so their component
 * list isn't reliable. In expanded mode online combos remain under "combo".
 */
export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '30days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';
    const hideShellStaff = searchParams.get('hideShellStaff') === 'true';
    const expanded = searchParams.get('expanded') === 'true';
    const source = searchParams.get('source') || 'all';

    const { startDate, endDate } = buildDateFilter(range, startDateParam, endDateParam);

    const posOrders = source !== 'online'
      ? getSaleOrders({ branchId, range, startDate: startDateParam, endDate: endDateParam, hideStaffMeals, hideShellStaff })
      : [];

    const onlineOrders = source !== 'pos'
      ? await getCollectedOnlineOrders({ startDate, endDate })
      : [];

    const stats: Record<string, CategoryStat> = {};
    let totalItems = 0;
    let totalRevenue = 0;
    let onlineCombosGrouped = 0; // for the "not decomposed" note

    const add = (category: string | undefined, quantity: number, revenue: number) => {
      const key = category || 'Uncategorized';
      if (!stats[key]) stats[key] = { category: key, quantity: 0, revenue: 0 };
      stats[key].quantity += quantity;
      stats[key].revenue += revenue;
      totalItems += quantity;
      totalRevenue += revenue;
    };

    // POS orders — OrderItem carries its own category; combos can be expanded.
    for (const order of posOrders) {
      for (const item of order.items) {
        const itemRevenue = item.finalPrice * item.quantity;
        const ownCategory = item.category || getProduct(item.productId)?.category;

        // Decompose real combos into their component categories.
        if (expanded && ownCategory === 'combo') {
          const v = parseItemVariations(item);
          const decomposed = expandComboToCategories(v, item.quantity, itemRevenue);
          if (decomposed) {
            for (const part of decomposed) add(part.category, part.quantity, part.revenue);
            continue; // combo itself not counted
          }
          // no parseable components → fall through and count as a combo
        }

        add(ownCategory, item.quantity, itemRevenue);
      }
    }

    // Online orders — resolve category from the catalog; combos stay grouped.
    for (const order of onlineOrders) {
      for (const item of order.items) {
        const itemRevenue = item.finalPrice * item.quantity;
        const category = getProduct(item.productId)?.category;
        if (expanded && category === 'combo') onlineCombosGrouped += item.quantity;
        add(category, item.quantity, itemRevenue);
      }
    }

    const categories = Object.values(stats)
      .map((c) => ({
        ...c,
        pctItems: totalItems > 0 ? (c.quantity / totalItems) * 100 : 0,
        pctRevenue: totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.quantity - a.quantity);

    return NextResponse.json({
      categories,
      totals: { items: totalItems, revenue: totalRevenue, categories: categories.length },
      expanded,
      onlineCombosGrouped,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/sales/categories');
  }
}

/**
 * Decompose a POS combo line into per-component category shares, mirroring the
 * products-sold "expanded" view. Revenue is split across visible components by
 * base price so the parts sum back to the combo's revenue. Returns null when the
 * combo has no usable component metadata (caller then counts it as a combo).
 */
function expandComboToCategories(
  v: Record<string, any>,
  lineQty: number,
  lineRevenue: number,
): Array<{ category: string | undefined; quantity: number; revenue: number }> | null {
  if (!v._bundle_components) return null;

  let components: any[];
  try {
    components = typeof v._bundle_components === 'string'
      ? JSON.parse(v._bundle_components)
      : v._bundle_components;
  } catch {
    return null;
  }
  if (!Array.isArray(components)) return null;

  const visible = components.filter(
    (c) => c.productId && c.productName && c.category !== 'hidden' && c.category !== 'private',
  );
  if (visible.length === 0) return null;

  const withPrices = visible.map((c) => {
    const prod = getProduct(c.productId);
    return {
      productId: c.productId,
      // Prefer the live catalog category; fall back to the stored one.
      category: prod?.category || c.category,
      basePrice: c.basePrice || prod?.basePrice || 0,
      quantity: c.quantity || 1,
    };
  });

  const totalBase = withPrices.reduce((s, c) => s + c.basePrice * c.quantity, 0);

  return withPrices.map((c) => {
    const compBaseTotal = c.basePrice * c.quantity;
    const revenue = totalBase > 0
      ? (compBaseTotal / totalBase) * lineRevenue
      : lineRevenue / withPrices.length; // equal split if no base prices
    return {
      category: c.category,
      quantity: c.quantity * lineQty,
      revenue,
    };
  });
}
