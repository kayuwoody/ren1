import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db/init';

export async function GET() {
  const userId = (await cookies()).get('userId')?.value;
  if (userId) {
    const customer = db.prepare('SELECT id, email, phone, name FROM Customer WHERE id = ?').get(userId) as any;
    if (customer) {
      return NextResponse.json({ userId: customer.id, email: customer.email, phone: customer.phone, name: customer.name });
    }
  }
  return NextResponse.json({ userId: null });
}
