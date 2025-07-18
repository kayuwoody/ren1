// 4. app/api/orders/processing/route.ts 
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { findProcessingOrder } from '@/lib/orderService';

export async function GET(req: Request) {
  try {
    // pull clientId from ?clientId=…
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId') || '';
    if (!clientId) {
      // no clientId → no in-progress order
      return NextResponse.json(null);
    }

    const order = await findProcessingOrder(clientId);
    return NextResponse.json(order);
  } catch (err: any) {
    console.error('Error finding processing order:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}