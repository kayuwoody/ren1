import { NextResponse } from 'next/server';
import { fetchAllWooPages, getMetaValue } from '@/lib/api/woocommerce-helpers';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { handleApiError } from '@/lib/api/error-handler';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

interface SaleDetail {
  orderId: number;
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
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';

    // Calculate date range
    // Get current time in GMT+8 (Malaysia timezone)
    const now = new Date();
    const utc8Now = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const currentYear = utc8Now.getUTCFullYear();
    const currentMonth = utc8Now.getUTCMonth();
    const currentDay = utc8Now.getUTCDate();

    let startDate = new Date();
    let endDate = new Date();

    // Set endDate to end of current day in GMT+8 (converted to UTC)
    // GMT+8 23:59:59 = UTC 15:59:59 same day
    endDate = new Date(Date.UTC(currentYear, currentMonth, currentDay, 23, 59, 59, 999) - (8 * 60 * 60 * 1000));

    if (startDateParam && endDateParam) {
      // Custom date range - parse as GMT+8 dates
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
          // Start from 7 days ago at midnight GMT+8
          startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 7, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
          break;
        case '30days':
          // Start from 30 days ago at midnight GMT+8
          startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 30, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
          break;
        case '90days':
          // Start from 90 days ago at midnight GMT+8
          startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 90, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
          break;
        case 'mtd':
          // Month to date - start of current month in GMT+8
          // First day of current month at midnight GMT+8, converted to UTC
          startDate = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
          break;
        case 'ytd':
          // Year to date - start of current year in GMT+8
          // January 1st of current year at midnight GMT+8, converted to UTC
          startDate = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
          break;
        case 'all':
          startDate = new Date('2020-01-01');
          break;
      }
    }

    console.log('📊 Products sold report date range:', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      range
    });

    // Fetch all orders
    const allOrders = await fetchAllWooPages('orders', {
      after: startDate.toISOString(),
      before: endDate.toISOString(),
    });

    // Filter valid orders
    let orders = allOrders.filter(
      (order) => order.status === 'completed' || order.status === 'processing' || order.status === 'ready-for-pickup'
    );

    // Filter out staff meals if requested
    if (hideStaffMeals) {
      orders = orders.filter((order) => {
        const finalTotal = parseFloat(
          getMetaValue(order.meta_data, '_final_total', order.total)
        );
        return finalTotal > 0;
      });
    }

    // Track product stats
    const productStats: Record<string, ProductData> = {};
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalProfit = 0;
    let totalItemsSold = 0;
    let totalDiscounts = 0;

    orders.forEach((order) => {
      // Get order-level data
      const orderDiscount = parseFloat(
        getMetaValue(order.meta_data, '_total_discount', '0')
      );

      // Get COGS from consumption records
      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(String(order.id));
      } catch (err) {
        // COGS not available
      }

      // Calculate per-item discount (proportional)
      const orderTotal = parseFloat(
        getMetaValue(order.meta_data, '_final_total', order.total)
      );
      const orderSubtotal = order.line_items?.reduce((sum: number, item: any) => {
        const finalPrice = parseFloat(getMetaValue(item.meta_data, '_final_price', item.price));
        return sum + (finalPrice * item.quantity);
      }, 0) || orderTotal;

      order.line_items?.forEach((item: any) => {
        const finalPrice = parseFloat(
          getMetaValue(item.meta_data, '_final_price', item.price)
        );
        const itemRevenue = finalPrice * item.quantity;

        // Get COGS for this item
        let itemCOGS = 0;
        try {
          const itemConsumptions = item.id
            ? orderConsumptions.filter(c => Number(c.orderItemId) === Number(item.id))
            : orderConsumptions;
          itemCOGS = itemConsumptions.reduce((sum, c) => sum + c.totalCost, 0);
        } catch (err) {
          // COGS not available
        }

        // Calculate proportional discount for this item
        const itemDiscountShare = orderSubtotal > 0
          ? (itemRevenue / orderSubtotal) * orderDiscount
          : 0;

        // Use bundle display name if available
        const isBundle = getMetaValue(item.meta_data, '_is_bundle') === 'true';
        const bundleDisplayName = getMetaValue(item.meta_data, '_bundle_display_name');
        const productName = isBundle && bundleDisplayName ? bundleDisplayName : item.name;

        if (!productStats[productName]) {
          productStats[productName] = {
            name: productName,
            quantity: 0,
            revenue: 0,
            cogs: 0,
            profit: 0,
            margin: 0,
            avgPrice: 0,
            avgCogs: 0,
            avgProfit: 0,
            discountTotal: 0,
            sales: [],
          };
        }

        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += (itemRevenue - itemCOGS);
        productStats[productName].discountTotal += itemDiscountShare;

        // Add sale detail
        productStats[productName].sales.push({
          orderId: order.id,
          orderNumber: order.number || String(order.id),
          date: order.date_created,
          quantity: item.quantity,
          price: finalPrice,
          cogs: itemCOGS / item.quantity,
        });

        totalRevenue += itemRevenue;
        totalCOGS += itemCOGS;
        totalProfit += (itemRevenue - itemCOGS);
        totalItemsSold += item.quantity;
        totalDiscounts += itemDiscountShare;
      });
    });

    // Calculate averages and margins, sort sales by date descending
    const products = Object.values(productStats).map(p => ({
      ...p,
      margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      avgPrice: p.quantity > 0 ? p.revenue / p.quantity : 0,
      avgCogs: p.quantity > 0 ? p.cogs / p.quantity : 0,
      avgProfit: p.quantity > 0 ? p.profit / p.quantity : 0,
      sales: p.sales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }));

    // Sort by quantity sold (default)
    const allProducts = [...products].sort((a, b) => b.quantity - a.quantity);

    // Top performers
    const topSelling = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const highestRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const highestProfit = [...products].sort((a, b) => b.profit - a.profit).slice(0, 5);
    const bestMargin = [...products].filter(p => p.quantity >= 3).sort((a, b) => b.margin - a.margin).slice(0, 5);
    const worstMargin = [...products].filter(p => p.quantity >= 3).sort((a, b) => a.margin - b.margin).slice(0, 5);

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
      highlights: {
        topSelling,
        highestRevenue,
        highestProfit,
        bestMargin,
        worstMargin,
      },
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error, '/api/admin/products-sold');
  }
}
