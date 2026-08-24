import { NextResponse } from 'next/server';
import { getSaleOrders, buildDateFilter } from '@/lib/db/orderService';
import { getCollectedOnlineOrders } from '@/lib/db/onlineOrderService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toKLDate(utcStr: string): Date {
  return new Date(new Date(utcStr).getTime() + KL_OFFSET_MS);
}

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '90days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';
    const hideShellStaff = searchParams.get('hideShellStaff') === 'true';
    const source = searchParams.get('source') || 'all';

    const { startDate, endDate } = buildDateFilter(range, startDateParam, endDateParam);

    const posOrders = source !== 'online'
      ? getSaleOrders({ branchId, range, startDate: startDateParam, endDate: endDateParam, hideStaffMeals, hideShellStaff })
      : [];

    const onlineOrders = source !== 'pos'
      ? await getCollectedOnlineOrders({ startDate, endDate })
      : [];

    const byDayOfWeek: Record<number, { revenue: number; orders: number; dates: Set<string> }> = {};
    const byDayOfMonth: Record<number, { revenue: number; orders: number; dates: Set<string> }> = {};
    const byHour: Record<number, { revenue: number; orders: number }> = {};

    for (let i = 0; i < 7; i++) byDayOfWeek[i] = { revenue: 0, orders: 0, dates: new Set() };
    for (let i = 1; i <= 31; i++) byDayOfMonth[i] = { revenue: 0, orders: 0, dates: new Set() };
    for (let i = 0; i < 24; i++) byHour[i] = { revenue: 0, orders: 0 };

    const allOrders = [
      ...posOrders.map(o => ({ total: o.total, createdAt: o.createdAt })),
      ...onlineOrders.map(o => ({ total: o.total, createdAt: o.createdAt })),
    ];

    const uniqueDates = new Set<string>();

    for (const order of allOrders) {
      const kl = toKLDate(order.createdAt);
      const dow = kl.getUTCDay();
      const dom = kl.getUTCDate();
      const hour = kl.getUTCHours();
      const dateKey = `${kl.getUTCFullYear()}-${kl.getUTCMonth()}-${dom}`;

      byDayOfWeek[dow].revenue += order.total;
      byDayOfWeek[dow].orders += 1;
      byDayOfWeek[dow].dates.add(dateKey);

      byDayOfMonth[dom].revenue += order.total;
      byDayOfMonth[dom].orders += 1;
      byDayOfMonth[dom].dates.add(dateKey);

      byHour[hour].revenue += order.total;
      byHour[hour].orders += 1;

      uniqueDates.add(dateKey);
    }

    const totalDays = uniqueDates.size || 1;

    const dayOfWeek = Object.entries(byDayOfWeek).map(([dow, data]) => {
      const occurrences = data.dates.size || 1;
      return {
        day: Number(dow),
        dayName: DAY_NAMES[Number(dow)],
        revenue: data.revenue,
        orders: data.orders,
        avgRevenue: data.revenue / occurrences,
        avgOrders: data.orders / occurrences,
        occurrences,
      };
    });

    const dayOfMonth = Object.entries(byDayOfMonth)
      .filter(([, data]) => data.orders > 0)
      .map(([dom, data]) => {
        const occurrences = data.dates.size || 1;
        return {
          day: Number(dom),
          revenue: data.revenue,
          orders: data.orders,
          avgRevenue: data.revenue / occurrences,
          avgOrders: data.orders / occurrences,
          occurrences,
        };
      });

    const hourOfDay = Object.entries(byHour).map(([hour, data]) => ({
      hour: Number(hour),
      revenue: data.revenue,
      orders: data.orders,
      avgRevenue: data.revenue / totalDays,
      avgOrders: data.orders / totalDays,
    }));

    return NextResponse.json({
      dayOfWeek,
      dayOfMonth,
      hourOfDay,
      totalOrders: allOrders.length,
      totalRevenue: allOrders.reduce((s, o) => s + o.total, 0),
      totalDays,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/sales/patterns');
  }
}
