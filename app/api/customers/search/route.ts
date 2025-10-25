import { NextRequest, NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const email = searchParams.get('email');

    if (!phone && !email) {
      return NextResponse.json(
        { error: 'Phone or email required' },
        { status: 400 }
      );
    }

    // Search for customer in WooCommerce
    // WooCommerce doesn't have direct phone search, so we search all customers
    // and filter by billing phone
    const { data: customers } = await wcApi.get('customers', {
      per_page: 100, // Get more customers to search through
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
  } catch (error: any) {
    console.error('Customer search error:', error);
    return NextResponse.json(
      { error: 'Failed to search customers' },
      { status: 500 }
    );
  }
}
