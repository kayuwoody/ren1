// app/api/test-woo/route.ts

import { NextResponse } from 'next/server';
import api from '@/lib/wooApi';
import { handleApiError } from '@/lib/api/error-handler';

export async function GET() {
  try {
    const { data } = await api.get('customers?per_page=5');
    return NextResponse.json({ success: true, customers: data });
  } catch (error) {
    return handleApiError(error, '/api/test-woo');
  }
}
