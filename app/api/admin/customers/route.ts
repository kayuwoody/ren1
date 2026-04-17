import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const customers = db.prepare(
      'SELECT * FROM Customer ORDER BY createdAt DESC'
    ).all() as any[];

    const formatted = customers.map(c => ({
      id: c.id,
      email: c.email || '',
      first_name: c.name || '',
      billing: {
        phone: c.phone || '',
        first_name: c.name || '',
        email: c.email || '',
      },
      date_created: c.createdAt,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    return handleApiError(error, '/api/admin/customers');
  }
}
