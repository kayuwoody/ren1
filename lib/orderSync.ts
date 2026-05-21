import { supabase } from '@/lib/supabase';

interface PosOrderData {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  subtotal: number;
  total: number;
  totalCost: number;
  totalProfit: number;
  paymentMethod: string;
  branchId: string;
  loyaltyMemberId: string | null;
  loyaltyMemberPhone: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    category: string;
    quantity: number;
    basePrice: number;
    unitPrice: number;
    subtotal: number;
    discountApplied: number;
  }>;
}

export async function syncPosOrder(data: PosOrderData): Promise<void> {
  try {
    const { error: orderErr } = await supabase
      .from('pos_orders')
      .upsert({
        id: data.id,
        order_number: data.orderNumber,
        status: data.status,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        subtotal: data.subtotal,
        total: data.total,
        total_cost: data.totalCost,
        total_profit: data.totalProfit,
        payment_method: data.paymentMethod,
        branch_id: data.branchId,
        loyalty_member_id: data.loyaltyMemberId,
        loyalty_member_phone: data.loyaltyMemberPhone,
        created_at: data.createdAt,
        updated_at: data.createdAt,
      }, { onConflict: 'id' });

    if (orderErr) {
      console.warn('⚠️ POS order sync failed:', orderErr.message);
      return;
    }

    if (data.items.length > 0) {
      const itemRows = data.items.map(item => ({
        id: item.id,
        order_id: data.id,
        product_id: item.productId,
        product_name: item.productName,
        category: item.category,
        qty: item.quantity,
        base_price: item.basePrice,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
        discount_applied: item.discountApplied,
      }));

      const { error: itemErr } = await supabase
        .from('pos_order_items')
        .upsert(itemRows, { onConflict: 'id' });

      if (itemErr) {
        console.warn('⚠️ POS order items sync failed:', itemErr.message);
      }
    }

    console.log(`☁️ POS order #${data.orderNumber} synced to Supabase`);
  } catch (err) {
    console.warn('⚠️ POS order sync error:', err);
  }
}
