// 5. app/api/orders/route.ts 
import { listWooOrders } from '@/lib/orderService';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cid = searchParams.get('cid'); // from query param
    const orders = await listWooOrders(cid);
    return NextResponse.json(orders);
    } catch (err: any) {
      console.error('❌ Error fetching WooCommerce orders:', err);
      return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 });
    }
}
