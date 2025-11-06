import { NextResponse } from 'next/server';
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';
import { handleApiError } from '@/lib/api/error-handler';

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
  } catch (error) {
    return handleApiError(error, '/api/admin/customers');
  }
}
