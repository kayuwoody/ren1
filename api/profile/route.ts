// app/api/profile/route.ts
import { NextResponse } from 'next/server';
import api from '@/lib/wooApi';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wooCustomerId = searchParams.get('id');

  if (!wooCustomerId) {
    return validationError('Missing WooCommerce ID', '/api/profile');
  }

  try {
    const { data: customer } = await api.get(`customers/${wooCustomerId}`);
    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error, '/api/profile');
  }
}
