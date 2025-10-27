import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';

/**
 * GET /api/admin/customers
 * Fetch all customers from WooCommerce
 */
export async function GET(req: Request) {
  try {
    const { data: customers } = (await wcApi.get('customers', {
      per_page: 100, // Adjust as needed
      orderby: 'registered_date',
      order: 'desc'
    })) as { data: any };

    return NextResponse.json(customers);
  } catch (err: any) {
    console.error('❌ Failed to fetch customers:', err);
    return NextResponse.json(
      { error: 'Failed to fetch customers', detail: err.message },
      { status: 500 }
    );
  }
}
