import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { wcApi } from '@/lib/wooClient';
import { handleApiError } from '@/lib/api/error-handler';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

type Order = any; // tighten if you have a Woo order type

function toNum(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    // optional filters
    const guestId = sp.get('guestId') || undefined;
    const status = sp.get('status') || undefined; // comma-separated OK
    const page = toNum(sp.get('page'), 1);
    const perPage = toNum(sp.get('per_page'), 50);

    // See if user is logged in (server-trusted cookie set by /api/login)
    const userIdCookie = cookies().get('userId')?.value;

    // ----- Logged-in path -----
    if (userIdCookie) {
      const params: Record<string, any> = {
        customer: Number(userIdCookie),
        per_page: perPage,
        page,
      };
      if (status) params.status = status;

      const { data } = (await wcApi.get('orders', params)) as { data: any };
      const orders = Array.isArray(data) ? data : [];
      sortNewestFirst(orders);
      return NextResponse.json(orders);
    }

    // ----- Guest path -----
    if (guestId) {
      const params: Record<string, any> = {
        meta_key: 'guestId',
        meta_value: guestId,
        per_page: perPage,
        page,
      };
      if (status) params.status = status;

      const { data } = (await wcApi.get('orders', params)) as { data: any };
      const orders = Array.isArray(data) ? data : [];
      sortNewestFirst(orders);
      return NextResponse.json(orders);
    }

    // No identity -> nothing to return
    return NextResponse.json([]);
  } catch (error) {
    return handleApiError(error, '/api/orders');
  }
}

// Helper: sort array in-place newest first
function sortNewestFirst(arr: Order[]) {
  arr.sort(
    (a: any, b: any) =>
      new Date(b?.date_created ?? 0).getTime() -
      new Date(a?.date_created ?? 0).getTime()
  );
}
