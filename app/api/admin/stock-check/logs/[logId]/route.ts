import { NextResponse } from 'next/server';
import { getStockCheckLogWithItems, deleteStockCheckLog } from '@/lib/db/stockCheckLogService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ logId: string }> }
) {
  try {
    const { logId } = await params;
    const log = getStockCheckLogWithItems(logId);

    if (!log) {
      return notFoundError('Stock check log not found', '/api/admin/stock-check/logs/[logId]');
    }

    return NextResponse.json({ log });
  } catch (error) {
    return handleApiError(error, '/api/admin/stock-check/logs/[logId]');
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ logId: string }> }
) {
  try {
    const { logId } = await params;
    const deleted = deleteStockCheckLog(logId);

    if (!deleted) {
      return notFoundError('Stock check log not found', '/api/admin/stock-check/logs/[logId]');
    }

    return NextResponse.json({ success: true, message: 'Stock check log deleted' });
  } catch (error) {
    return handleApiError(error, '/api/admin/stock-check/logs/[logId]');
  }
}
