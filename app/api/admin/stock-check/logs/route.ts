import { NextResponse } from 'next/server';
import { getStockCheckLogs } from '@/lib/db/stockCheckLogService';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * GET /api/admin/stock-check/logs
 *
 * Get paginated list of stock check logs
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { logs, total } = getStockCheckLogs(limit, offset);

    return NextResponse.json({ logs, total, limit, offset });
  } catch (error) {
    return handleApiError(error, '/api/admin/stock-check/logs');
  }
}
