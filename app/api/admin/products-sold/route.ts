import { NextResponse } from 'next/server';
import { fetchAllWooPages, getMetaValue } from '@/lib/api/woocommerce-helpers';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { handleApiError } from '@/lib/api/error-handler';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';

    // Calculate date range
    let startDate = new Date();
    let endDate = new Date();

    // Set endDate to end of day in UTC
    endDate.setUTCHours(23, 59, 59, 999);

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate = new Date(endDateParam);
      endDate.setUTCHours(23, 59, 59, 999);
    } else {
      switch (range) {
        case '7days':
          startDate.setDate(startDate.getDate() - 7);
          startDate.setUTCHours(0, 0, 0, 0);
          break;
        case '30days':
          startDate.setDate(startDate.getDate() - 30);
          startDate.setUTCHours(0, 0, 0, 0);
          break;
        case '90days':
          startDate.setDate(startDate.getDate() - 90);
          startDate.setUTCHours(0, 0, 0, 0);
          break;
        case 'mtd':
          startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
          startDate.setUTCHours(0, 0, 0, 0);
          break;
        case 'ytd':
          startDate = new Date(endDate.getFullYear(), 0, 1);
          startDate.setUTCHours(0, 0, 0, 0);
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
          };
        }

        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += (itemRevenue - itemCOGS);
        productStats[productName].discountTotal += itemDiscountShare;

        totalRevenue += itemRevenue;
        totalCOGS += itemCOGS;
        totalProfit += (itemRevenue - itemCOGS);
        totalItemsSold += item.quantity;
        totalDiscounts += itemDiscountShare;
      });
    });

    // Calculate averages and margins
    const products = Object.values(productStats).map(p => ({
      ...p,
      margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      avgPrice: p.quantity > 0 ? p.revenue / p.quantity : 0,
      avgCogs: p.quantity > 0 ? p.cogs / p.quantity : 0,
      avgProfit: p.quantity > 0 ? p.profit / p.quantity : 0,
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
