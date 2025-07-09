// app/api/test-woo/route.ts

import { NextResponse } from 'next/server';
import api from '@/lib/wooApi';

export async function GET() {
  try {
    const { data } = await api.get('customers?per_page=5');
    return NextResponse.json({ success: true, customers: data });
  } catch (error: any) {
    console.error('❌ WooCommerce API Test Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
