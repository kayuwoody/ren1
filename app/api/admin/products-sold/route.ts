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
    const expandedStats: Record<string, {
      name: string; quantity: number; standalone: number; fromCombos: number;
      revenue: number; cogs: number; combos: string[];
    }> = {};
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalProfit = 0;
    let totalItemsSold = 0;
    let totalDiscounts = 0;

    const addExpandedItem = (
      productName: string, qty: number, revenue: number, cogs: number,
      source: 'standalone' | 'combo', comboName?: string
    ) => {
      if (!expandedStats[productName]) {
        expandedStats[productName] = {
          name: productName, quantity: 0, standalone: 0, fromCombos: 0,
          revenue: 0, cogs: 0, combos: [],
        };
      }
      expandedStats[productName].quantity += qty;
      expandedStats[productName].revenue += revenue;
      expandedStats[productName].cogs += cogs;
      if (source === 'standalone') {
        expandedStats[productName].standalone += qty;
      } else {
        expandedStats[productName].fromCombos += qty;
        if (comboName && !expandedStats[productName].combos.includes(comboName)) {
          expandedStats[productName].combos.push(comboName);
        }
      }
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

        // Expanded view: break bundles into components with financials
        if (isBundle && v._bundle_components) {
          try {
            const components = typeof v._bundle_components === 'string'
              ? JSON.parse(v._bundle_components) : v._bundle_components;
            const visibleComps = components.filter(
              (c: any) => c.productName && c.category !== 'hidden' && c.category !== 'private'
            );
            // Look up each component's base price from the product table
            const compsWithPrices = visibleComps.map((c: any) => {
              const prod = c.productId ? getProduct(c.productId) : undefined;
              return {
                ...c,
                basePrice: c.basePrice || prod?.basePrice || 0,
                unitCost: c.unitCost || prod?.unitCost || prod?.supplierCost || 0,
              };
            });
            // Sum component base prices to calculate proportional revenue share
            const totalCompBasePrice = compsWithPrices.reduce(
              (s: number, c: any) => s + c.basePrice * (c.quantity || 1), 0
            );
            for (const comp of compsWithPrices) {
              const compQty = (comp.quantity || 1) * item.quantity;
              const compBaseTotal = comp.basePrice * (comp.quantity || 1);
              // Revenue: proportional share of the combo's actual revenue
              const compRevenue = totalCompBasePrice > 0
                ? (compBaseTotal / totalCompBasePrice) * itemRevenue
                : 0;
              // COGS: use the component's unit cost
              const compCogs = comp.unitCost * compQty;
              addExpandedItem(comp.productName, compQty, compRevenue, compCogs, 'combo', productName);
            }
          } catch {}
        } else {
          addExpandedItem(productName, item.quantity, itemRevenue, itemCOGS, 'standalone');
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
        addExpandedItem(productName, item.quantity, itemRevenue, itemCOGS, 'standalone');

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
      .map(e => ({
        ...e,
        profit: e.revenue - e.cogs,
        margin: e.revenue > 0 ? ((e.revenue - e.cogs) / e.revenue) * 100 : 0,
      }))
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
