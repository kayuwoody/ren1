import { NextResponse } from 'next/server';
import { getStockCheckLogWithItems, deleteStockCheckLog } from '@/lib/db/stockCheckLogService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

/**
 * GET /api/admin/stock-check/logs/[logId]
 *
 * Get a single stock check log with all its items
 */
export async function GET(
  req: Request,
  { params }: { params: { logId: string } }
) {
  try {
    const log = getStockCheckLogWithItems(params.logId);

    if (!log) {
      return notFoundError('Stock check log not found', '/api/admin/stock-check/logs/[logId]');
    }

    return NextResponse.json({ log });
  } catch (error) {
    return handleApiError(error, '/api/admin/stock-check/logs/[logId]');
  }
}

/**
 * DELETE /api/admin/stock-check/logs/[logId]
 *
 * Delete a stock check log
 */
export async function DELETE(
  req: Request,
  { params }: { params: { logId: string } }
) {
  try {
    const deleted = deleteStockCheckLog(params.logId);

    if (!deleted) {
      return notFoundError('Stock check log not found', '/api/admin/stock-check/logs/[logId]');
    }

    return NextResponse.json({ success: true, message: 'Stock check log deleted' });
  } catch (error) {
    return handleApiError(error, '/api/admin/stock-check/logs/[logId]');
  }
}
