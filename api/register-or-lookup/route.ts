import { NextRequest, NextResponse } from 'next/server';
import woo from '@/lib/wooApi';
import { v4 as uuidv4 } from 'uuid';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, phone, name, address } = body;

    if (!email && !phone) {
      return validationError('Email or phone is required', '/api/register-or-lookup');
    }

    // Lookup existing customer in WooCommerce
    const searchQuery = email ? `email=${email}` : `search=${phone}`;
    const { data: existing } = await woo.get(`customers?${searchQuery}`);

    let wooCustomerId: number | null = null;

    if (existing && existing.length > 0) {
      wooCustomerId = existing[0].id;
    } else {
      // Create new WooCommerce customer
      const { data: created } = await woo.post('customers', {
        email,
        billing: {
          phone,
          address_1: address,
          first_name: name,
        },
      });
      wooCustomerId = created.id;
    }

    // Generate or re-use clientId
    const clientId = uuidv4();

    return NextResponse.json({ clientId, wooCustomerId });
  } catch (error) {
    return handleApiError(error, '/api/register-or-lookup');
  }
}
