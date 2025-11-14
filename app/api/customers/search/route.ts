import { NextRequest, NextResponse } from 'next/server';
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';
import { handleApiError, validationError } from '@/lib/api/error-handler';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const email = searchParams.get('email');

    if (!phone && !email) {
      return validationError('Phone or email required', '/api/customers/search');
    }

    // Search for customer in WooCommerce
    // WooCommerce doesn't have direct phone search, so we fetch all customers
    // and filter by billing phone
    const customers = await fetchAllWooPages('customers', {
      role: 'all',
    });

    let foundCustomer = null;

    if (phone) {
      // Normalize phone number (remove spaces, dashes, etc.)
      const normalizedSearch = phone.replace(/[\s\-\(\)]/g, '');

      foundCustomer = customers.find((customer: any) => {
        const customerPhone = customer.billing?.phone || '';
        const normalizedCustomerPhone = customerPhone.replace(/[\s\-\(\)]/g, '');
        return normalizedCustomerPhone.includes(normalizedSearch) ||
               normalizedSearch.includes(normalizedCustomerPhone);
      });
    } else if (email) {
      foundCustomer = customers.find((customer: any) =>
        customer.email?.toLowerCase() === email.toLowerCase()
      );
    }

    if (foundCustomer) {
      return NextResponse.json({ customer: foundCustomer });
    }

    return NextResponse.json({ customer: null });
  } catch (error) {
    return handleApiError(error, '/api/customers/search');
  }
}
