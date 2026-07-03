import { NextResponse } from 'next/server';
import { getSaleOrders, parseItemVariations, buildDateFilter } from '@/lib/db/orderService';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { getCollectedOnlineOrders } from '@/lib/db/onlineOrderService';
import { getProduct } from '@/lib/db/productService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

interface SaleDetail {
  orderId: number | string;
  orderNumber: string;
  date: string;
  quantity: number;
  price: number;
  cogs: number;
}

interface ProductData {
  name: string;
  quantity: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin: number;
  avgPrice: number;
  avgCogs: number;
  avgProfit: number;
  discountTotal: number;
  sales: SaleDetail[];
}

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';
    const source = searchParams.get('source') || 'all';

    const { startDate, endDate } = buildDateFilter(range, startDateParam, endDateParam);

    const posOrders = source !== 'online'
      ? getSaleOrders({ branchId, range, startDate: startDateParam, endDate: endDateParam, hideStaffMeals })
      : [];

    const onlineOrders = source !== 'pos'
      ? await getCollectedOnlineOrders({ startDate, endDate })
      : [];

    const productStats: Record<string, ProductData> = {};
    // Expanded view: counts each component product individually (incl. inside combos)
    // Groups by productId so variants (Hot/Iced Americano) merge under the base product
    const expandedStats: Record<string, {
      productId: string; name: string; quantity: number; standalone: number; fromCombos: number;
      revenue: number; cogs: number; combos: string[];
      variants: Record<string, {
        name: string; quantity: number; standalone: number; fromCombos: number;
        revenue: number; cogs: number;
      }>;
    }> = {};
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalProfit = 0;
    let totalItemsSold = 0;
    let totalDiscounts = 0;

    const addExpandedItem = (
      productId: string, productName: string, qty: number, revenue: number, cogs: number,
      source: 'standalone' | 'combo', comboName?: string
    ) => {
      // Look up base product name; fall back to display name without variant prefix
      const baseName = (() => {
        const prod = getProduct(productId);
        return prod?.name || productName;
      })();
      if (!expandedStats[productId]) {
        expandedStats[productId] = {
          productId, name: baseName, quantity: 0, standalone: 0, fromCombos: 0,
          revenue: 0, cogs: 0, combos: [], variants: {},
        };
      }
      expandedStats[productId].quantity += qty;
      expandedStats[productId].revenue += revenue;
      expandedStats[productId].cogs += cogs;
      if (source === 'standalone') {
        expandedStats[productId].standalone += qty;
      } else {
        expandedStats[productId].fromCombos += qty;
        if (comboName && !expandedStats[productId].combos.includes(comboName)) {
          expandedStats[productId].combos.push(comboName);
        }
      }
      // Track variant-level stats. Always record a variant (keyed by the display
      // name) so the breakdown reconciles to the base total — base-name sales
      // (no modifier selected) show under the base name.
      const variantKey = productName;
      if (!expandedStats[productId].variants[variantKey]) {
        expandedStats[productId].variants[variantKey] = {
          name: variantKey, quantity: 0, standalone: 0, fromCombos: 0,
          revenue: 0, cogs: 0,
        };
      }
      const variant = expandedStats[productId].variants[variantKey];
      variant.quantity += qty;
      variant.revenue += revenue;
      variant.cogs += cogs;
      if (source === 'standalone') variant.standalone += qty;
      else variant.fromCombos += qty;
    };

    // Process POS orders
    for (const order of posOrders) {
      const orderDiscount = order.items.reduce(
        (s, it) => s + (it.discountApplied || 0) * it.quantity,
        0,
      );

      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(order.id);
      } catch {}

      const orderSubtotal = order.items.reduce(
        (s, it) => s + it.finalPrice * it.quantity,
        0,
      ) || order.total;

      for (const item of order.items) {
        const v = parseItemVariations(item);
        const finalPrice = item.finalPrice;
        const itemRevenue = finalPrice * item.quantity;

        const itemConsumptions = orderConsumptions.filter(
          (c) => String(c.orderItemId) === String(item.id),
        );
        const itemCOGS = itemConsumptions.reduce((sum, c) => sum + c.totalCost, 0);

        const itemDiscountShare = orderSubtotal > 0
          ? (itemRevenue / orderSubtotal) * orderDiscount
          : 0;

        const isBundle = v._is_bundle === 'true';
        const bundleDisplayName = v._bundle_display_name;
        const productName = isBundle && bundleDisplayName ? bundleDisplayName : item.productName;

        if (!productStats[productName]) {
          productStats[productName] = {
            name: productName, quantity: 0, revenue: 0, cogs: 0, profit: 0,
            margin: 0, avgPrice: 0, avgCogs: 0, avgProfit: 0, discountTotal: 0, sales: [],
          };
        }

        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += itemRevenue - itemCOGS;
        productStats[productName].discountTotal += itemDiscountShare;

        productStats[productName].sales.push({
          orderId: order.wcId ?? order.id,
          orderNumber: order.orderNumber,
          date: order.createdAt,
          quantity: item.quantity,
          price: finalPrice,
          cogs: item.quantity > 0 ? itemCOGS / item.quantity : 0,
        });

        // Expanded view: start from the products-sold count (every line counted
        // as-is under its base product), then dive into real combos and add each
        // component to its product's count.
        // NOTE: A combo is identified by product CATEGORY, not by _is_bundle —
        // single products with variants (e.g. Hot/Iced Latte) also set _is_bundle,
        // but they are ONE sellable item and must not be exploded into recipe parts.
        const itemProduct = getProduct(item.productId);
        const isComboProduct = itemProduct?.category === 'combo';

        // Step 1: count the line item itself (latte → latte, combo → combo)
        addExpandedItem(item.productId, productName, item.quantity, itemRevenue, itemCOGS, 'standalone');

        // Step 2: for real combos, add each direct component to its product
        if (isComboProduct && v._bundle_components) {
          try {
            const components = typeof v._bundle_components === 'string'
              ? JSON.parse(v._bundle_components) : v._bundle_components;
            const visibleComps = (components as any[]).filter(
              (c) => c.productId && c.productName && c.category !== 'hidden' && c.category !== 'private'
            );

            if (visibleComps.length > 0) {
              // Per-component COGS from consumption records (trace materials up to direct child)
              const comboProductId = item.productId;
              const parentMap: Record<string, string> = {};
              for (const c of itemConsumptions) {
                if (c.itemType === 'product' && c.linkedProductId) {
                  parentMap[c.linkedProductId] = c.productId;
                }
              }
              const resolveTopChild = (pid: string): string | null => {
                let current = pid;
                for (let i = 0; i < 10; i++) {
                  const parent = parentMap[current];
                  if (!parent || parent === comboProductId) return current;
                  current = parent;
                }
                return current;
              };
              const componentCogs: Record<string, number> = {};
              let comboLevelCost = 0;
              for (const c of itemConsumptions) {
                if (c.itemType === 'material' && c.totalCost > 0) {
                  const topChild = resolveTopChild(c.productId);
                  if (topChild && topChild !== comboProductId) {
                    componentCogs[topChild] = (componentCogs[topChild] || 0) + c.totalCost;
                  } else {
                    comboLevelCost += c.totalCost;
                  }
                }
              }
              if (comboLevelCost > 0) {
                const share = comboLevelCost / visibleComps.length;
                for (const c of visibleComps) {
                  componentCogs[c.productId] = (componentCogs[c.productId] || 0) + share;
                }
              }

              const compsWithPrices = visibleComps.map((c) => {
                const prod = getProduct(c.productId);
                return {
                  ...c,
                  basePrice: c.basePrice || prod?.basePrice || 0,
                  actualCogs: componentCogs[c.productId] || 0,
                };
              });
              const totalCompBasePrice = compsWithPrices.reduce(
                (s, c) => s + c.basePrice * (c.quantity || 1), 0
              );
              const totalActualCogs = compsWithPrices.reduce(
                (s, c) => s + c.actualCogs, 0
              );

              for (const comp of compsWithPrices) {
                const compQty = (comp.quantity || 1) * item.quantity;
                const compBaseTotal = comp.basePrice * (comp.quantity || 1);
                const compRevenue = totalCompBasePrice > 0
                  ? (compBaseTotal / totalCompBasePrice) * itemRevenue
                  : 0;
                const compCogs = totalActualCogs > 0
                  ? comp.actualCogs
                  : totalCompBasePrice > 0
                    ? (compBaseTotal / totalCompBasePrice) * itemCOGS
                    : 0;
                addExpandedItem(comp.productId, comp.productName, compQty, compRevenue, compCogs, 'combo', productName);
              }
            }
          } catch {}
        }

        totalRevenue += itemRevenue;
        totalCOGS += itemCOGS;
        totalProfit += itemRevenue - itemCOGS;
        totalItemsSold += item.quantity;
        totalDiscounts += itemDiscountShare;
      }
    }

    // Process online orders
    for (const order of onlineOrders) {
      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(order.id);
      } catch {}

      for (const item of order.items) {
        const itemRevenue = item.finalPrice * item.quantity;
        const itemConsumptions = orderConsumptions.filter(
          (c: any) => String(c.orderItemId) === String(item.id),
        );
        const itemCOGS = itemConsumptions.reduce((sum: number, c: any) => sum + c.totalCost, 0);
        const productName = item.productName;

        if (!productStats[productName]) {
          productStats[productName] = {
            name: productName, quantity: 0, revenue: 0, cogs: 0, profit: 0,
            margin: 0, avgPrice: 0, avgCogs: 0, avgProfit: 0, discountTotal: 0, sales: [],
          };
        }

        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += itemRevenue - itemCOGS;

        productStats[productName].sales.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          date: order.createdAt,
          quantity: item.quantity,
          price: item.finalPrice,
          cogs: item.quantity > 0 ? itemCOGS / item.quantity : 0,
        });

        // Expanded view for online orders (no bundle metadata currently)
        addExpandedItem(item.productId || productName, productName, item.quantity, itemRevenue, itemCOGS, 'standalone');

        totalRevenue += itemRevenue;
        totalCOGS += itemCOGS;
        totalProfit += itemRevenue - itemCOGS;
        totalItemsSold += item.quantity;
      }
    }

    const products = Object.values(productStats).map((p) => ({
      ...p,
      margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      avgPrice: p.quantity > 0 ? p.revenue / p.quantity : 0,
      avgCogs: p.quantity > 0 ? p.cogs / p.quantity : 0,
      avgProfit: p.quantity > 0 ? p.profit / p.quantity : 0,
      sales: p.sales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }));

    const allProducts = [...products].sort((a, b) => b.quantity - a.quantity);

    const topSelling = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const highestRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const highestProfit = [...products].sort((a, b) => b.profit - a.profit).slice(0, 5);
    const bestMargin = [...products]
      .filter((p) => p.quantity >= 3)
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
    const worstMargin = [...products]
      .filter((p) => p.quantity >= 3)
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 5);

    // Reconstruct displayable date range (mirrors orderService buildDateFilter)
    const now = new Date();
    const utc8Now = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const currentYear = utc8Now.getUTCFullYear();
    const currentMonth = utc8Now.getUTCMonth();
    const currentDay = utc8Now.getUTCDate();
    let rangeStart: Date;
    let rangeEnd = new Date(
      Date.UTC(currentYear, currentMonth, currentDay, 23, 59, 59, 999) - 8 * 60 * 60 * 1000,
    );
    if (startDateParam && endDateParam) {
      const sp = startDateParam.split('-');
      const ep = endDateParam.split('-');
      rangeStart = new Date(
        Date.UTC(parseInt(sp[0]), parseInt(sp[1]) - 1, parseInt(sp[2]), 0, 0, 0, 0) -
          8 * 60 * 60 * 1000,
      );
      rangeEnd = new Date(
        Date.UTC(parseInt(ep[0]), parseInt(ep[1]) - 1, parseInt(ep[2]), 23, 59, 59, 999) -
          8 * 60 * 60 * 1000,
      );
    } else {
      switch (range) {
        case '30days':
          rangeStart = new Date(
            Date.UTC(currentYear, currentMonth, currentDay - 30, 0, 0, 0, 0) - 8 * 60 * 60 * 1000,
          );
          break;
        case '90days':
          rangeStart = new Date(
            Date.UTC(currentYear, currentMonth, currentDay - 90, 0, 0, 0, 0) - 8 * 60 * 60 * 1000,
          );
          break;
        case 'mtd':
          rangeStart = new Date(
            Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0) - 8 * 60 * 60 * 1000,
          );
          break;
        case 'ytd':
          rangeStart = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0) - 8 * 60 * 60 * 1000);
          break;
        case 'all':
          rangeStart = new Date('2020-01-01');
          break;
        case '7days':
        default:
          rangeStart = new Date(
            Date.UTC(currentYear, currentMonth, currentDay - 7, 0, 0, 0, 0) - 8 * 60 * 60 * 1000,
          );
      }
    }

    const expandedItems = Object.values(expandedStats)
      .map(e => {
        const variants = Object.values(e.variants)
          .map(v => ({
            ...v,
            profit: v.revenue - v.cogs,
            margin: v.revenue > 0 ? ((v.revenue - v.cogs) / v.revenue) * 100 : 0,
          }))
          .sort((a, b) => b.quantity - a.quantity);
        return {
          ...e,
          profit: e.revenue - e.cogs,
          margin: e.revenue > 0 ? ((e.revenue - e.cogs) / e.revenue) * 100 : 0,
          variants,
        };
      })
      .sort((a, b) => b.quantity - a.quantity);

    const report = {
      summary: {
        totalProducts: products.length,
        totalItemsSold,
        totalRevenue,
        totalCOGS,
        totalProfit,
        overallMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        totalDiscounts,
        avgPricePerItem: totalItemsSold > 0 ? totalRevenue / totalItemsSold : 0,
        avgProfitPerItem: totalItemsSold > 0 ? totalProfit / totalItemsSold : 0,
      },
      allProducts,
      expandedItems,
      highlights: {
        topSelling,
        highestRevenue,
        highestProfit,
        bestMargin,
        worstMargin,
      },
      dateRange: {
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      },
    };

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error, '/api/admin/products-sold');
  }
}
