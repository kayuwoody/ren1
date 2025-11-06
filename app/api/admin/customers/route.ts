import { NextResponse } from 'next/server';
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';

/**
 * GET /api/admin/customers
 * Fetch all customers from WooCommerce
 */
export async function GET(req: Request) {
  try {
    const customers = await fetchAllWooPages('customers', {
      orderby: 'registered_date',
      order: 'desc'
    });

    return NextResponse.json(customers);
  } catch (err: any) {
    console.error('❌ Failed to fetch customers:', err);
    return NextResponse.json(
      { error: 'Failed to fetch customers', detail: err.message },
      { status: 500 }
    );
  }
}
