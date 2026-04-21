import { NextResponse } from 'next/server';
import { getOrderWithItems, toWcOrderShape } from '@/lib/db/orderService';
import { generateReceiptHTML } from '@/lib/receiptGenerator';
import { uploadReceiptHTML } from '@/lib/ftpUpload';
import { handleApiError, validationError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { getBranch } from '@/lib/db/branchService';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return validationError('orderId is required', '/api/receipts/generate');
    }

    const orderWithItems = getOrderWithItems(orderId);
    if (!orderWithItems) {
      return validationError(`Order #${orderId} not found`, '/api/receipts/generate');
    }

    const order = toWcOrderShape(orderWithItems);
    const branchId = getBranchIdFromRequest(req);
    const branch = getBranch(branchId);
    const branchInfo = branch ? { name: branch.name, address: branch.address, phone: branch.phone, code: branch.code } : undefined;

    const htmlContent = generateReceiptHTML(order, branchInfo);

    const receiptUrl = await uploadReceiptHTML(orderId, htmlContent);

    return NextResponse.json({
      success: true,
      receiptUrl,
      orderId: order.id,
    });
  } catch (error) {
    return handleApiError(error, '/api/receipts/generate');
  }
}
