import { NextResponse } from 'next/server';
import { getWooOrder, updateWooOrder } from '@/lib/orderService';
import { handleApiError, validationError } from '@/lib/api/error-handler';

/**
 * PATCH /api/orders/[orderId]/update-items
 *
 * Update line_items on a pending order
 * Only allowed for orders with status: pending
 * Used when user modifies cart before paying
 */
export async function PATCH(
  req: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId } = params;
    const { line_items } = await req.json();

    if (!line_items || !Array.isArray(line_items)) {
      return validationError('line_items array required', '/api/orders/[orderId]/update-items');
    }

    // 1. Fetch existing order
    const existing = await getWooOrder(orderId);

    // 2. Only allow updates on pending orders
    if (existing.status !== 'pending') {
      return validationError('Can only update pending orders', '/api/orders/[orderId]/update-items');
    }

    // 3. Match cart items to existing line_items by product_id
    // This prevents duplicates by preserving WooCommerce line item IDs
    const mergedLineItems = line_items.map((cartItem: any) => {
      // Find existing line item with same product_id
      const existingItem = existing.line_items?.find(
        (li: any) => li.product_id === cartItem.product_id
      );

      // If found, update quantity and keep the id
      if (existingItem) {
        return {
          id: existingItem.id,  // CRITICAL: include id to UPDATE, not ADD
          product_id: cartItem.product_id,
          quantity: cartItem.quantity
        };
      }

      // New item, no id needed
      return {
        product_id: cartItem.product_id,
        quantity: cartItem.quantity
      };
    });

    // 4. Remove items that are no longer in cart
    // Mark removed items with quantity: 0
    const removedItems = existing.line_items
      ?.filter((existingItem: any) =>
        !line_items.some((cartItem: any) => cartItem.product_id === existingItem.product_id)
      )
      .map((item: any) => ({
        id: item.id,
        quantity: 0  // Setting quantity to 0 removes the item
      })) || [];

    const finalLineItems = [...mergedLineItems, ...removedItems];

    console.log(`🔄 Updating order #${orderId}:`, {
      cartItems: line_items.length,
      existingItems: existing.line_items?.length || 0,
      merged: mergedLineItems.length,
      removed: removedItems.length
    });

    // 5. Update line_items
    const updated = await updateWooOrder(orderId, {
      line_items: finalLineItems
    });

    console.log(`✅ Updated line_items for order #${orderId}`);

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/orders/[orderId]/update-items');
  }
}
