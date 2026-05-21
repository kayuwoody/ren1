import { NextResponse } from 'next/server';
import { getOrderWithItems, toWcOrderShape } from '@/lib/db/orderService';
import { generateReceiptHTML } from '@/lib/receiptGenerator';
import { uploadReceiptHTML, getReceiptUrl } from '@/lib/receiptStorage';
import { handleApiError, validationError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { getBranch } from '@/lib/db/branchService';
import { supabase } from '@/lib/supabase';

const BUCKET = 'receipts';

async function getMascotUrl(): Promise<string | undefined> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .list('', { search: 'mascot.jpg' });

  if (data && data.length > 0) {
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl('mascot.jpg');
    return urlData.publicUrl;
  }
  return undefined;
}

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

    const mascotUrl = await getMascotUrl();
    const htmlContent = generateReceiptHTML(order, branchInfo, mascotUrl);

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
