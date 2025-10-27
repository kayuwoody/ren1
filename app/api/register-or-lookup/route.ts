import { NextRequest, NextResponse } from 'next/server';
import woo from '@/lib/wooApi';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, phone, name, address } = body;

    if (!email && !phone) {
      return NextResponse.json({ error: 'Email or phone is required' }, { status: 400 });
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
  } catch (err: any) {
    console.error('❌ API error:', err.response?.data || err.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
