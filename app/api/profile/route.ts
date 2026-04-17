import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('id');

  if (!customerId) {
    return validationError('Missing customer ID', '/api/profile');
  }

  try {
    const customer = db.prepare('SELECT * FROM Customer WHERE id = ?').get(customerId) as any;
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error, '/api/profile');
  }
}
