import { NextResponse } from 'next/server';
import { getWooOrder } from '@/lib/orderService';
import { generateReceiptHTML } from '@/lib/receiptGenerator';
import { uploadReceiptHTML } from '@/lib/ftpUpload';
import { handleApiError, validationError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { getBranch } from '@/lib/db/branchService';

/**
 * POST /api/receipts/generate
 *
 * Generates static HTML receipt and uploads to Hostinger via FTP.
 *
 * Body: { orderId: string | number }
 * Returns: { success: true, receiptUrl: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return validationError('orderId is required', '/api/receipts/generate');
    }

    console.log(`📄 Generating receipt for order #${orderId}...`);

    // Fetch order from WooCommerce
    const order = await getWooOrder(orderId);

    if (!order) {
      return validationError(`Order #${orderId} not found`, '/api/receipts/generate');
    }

    // Get branch info for receipt
    const branchId = getBranchIdFromRequest(req);
    const branch = getBranch(branchId);
    const branchInfo = branch ? { name: branch.name, address: branch.address, phone: branch.phone, code: branch.code } : undefined;

    // Generate static HTML
    const htmlContent = generateReceiptHTML(order, branchInfo);
    console.log(`✅ Generated HTML receipt (${htmlContent.length} bytes)`);

    // Upload to FTP
    const receiptUrl = await uploadReceiptHTML(orderId, htmlContent);
    console.log(`✅ Receipt uploaded: ${receiptUrl}`);

    return NextResponse.json({
      success: true,
      receiptUrl,
      orderId: order.id,
    });
  } catch (error) {
    return handleApiError(error, '/api/receipts/generate');
  }
}
