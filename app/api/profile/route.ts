// app/api/profile/route.ts
import { NextResponse } from 'next/server';
import api from '@/lib/wooApi';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wooCustomerId = searchParams.get('id');

  if (!wooCustomerId) {
    return NextResponse.json({ error: 'Missing WooCommerce ID' }, { status: 400 });
  }

  try {
    const { data: customer } = await api.get(`customers/${wooCustomerId}`);
    return NextResponse.json(customer);
  } catch (err) {
    console.error('❌ Failed to fetch WooCommerce customer:', err);
    return NextResponse.json({ error: 'Could not retrieve profile' }, { status: 500 });
  }
}
