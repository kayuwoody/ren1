import { NextResponse } from 'next/server';
import { getOrders } from '@/lib/db/orderService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);

    const orders = getOrders({
      branchId,
    });

    return NextResponse.json(orders);
  } catch (error) {
    return handleApiError(error, '/api/admin/orders');
  }
}
