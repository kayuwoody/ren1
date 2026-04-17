import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const email = searchParams.get('email');

    if (!phone && !email) {
      return validationError('Phone or email required', '/api/customers/search');
    }

    let customer: any = null;

    if (phone) {
      const normalized = phone.replace(/[\s\-\(\)]/g, '');
      customer = db.prepare(
        'SELECT * FROM Customer WHERE phone LIKE ? OR phone LIKE ?'
      ).get(`%${normalized}%`, `%${normalized}`);
    } else if (email) {
      customer = db.prepare(
        'SELECT * FROM Customer WHERE email = ?'
      ).get(email.toLowerCase());
    }

    if (customer) {
      return NextResponse.json({
        customer: {
          id: customer.id,
          email: customer.email,
          billing: {
            phone: customer.phone || '',
            first_name: customer.name || '',
            email: customer.email || '',
          },
        },
      });
    }

    return NextResponse.json({ customer: null });
  } catch (error) {
    return handleApiError(error, '/api/customers/search');
  }
}
