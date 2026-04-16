import { NextResponse } from 'next/server';
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/customers
 * Fetch all customers from WooCommerce. Returns [] when WC is unreachable
 * so the UI degrades gracefully on offline branches.
 */
export async function GET(req: Request) {
  try {
    const customers = await fetchAllWooPages('customers', {
      orderby: 'registered_date',
      order: 'desc',
    });
    return NextResponse.json(customers);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const offline =
      msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED');
    if (offline) {
      console.warn('⚠️ /api/admin/customers: WooCommerce unreachable, returning empty list');
      return NextResponse.json([]);
    }
    return handleApiError(error, '/api/admin/customers');
  }
}
