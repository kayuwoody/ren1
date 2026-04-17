import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { v4 as uuidv4 } from 'uuid';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, phone, name, address } = body;

    if (!email && !phone) {
      return validationError('Email or phone is required', '/api/register-or-lookup');
    }

    let customer: any = null;

    if (email) {
      customer = db.prepare('SELECT * FROM Customer WHERE email = ?').get(email);
    }
    if (!customer && phone) {
      const normalized = phone.replace(/[\s\-\(\)]/g, '');
      customer = db.prepare('SELECT * FROM Customer WHERE phone = ?').get(normalized);
    }

    if (customer) {
      return NextResponse.json({ clientId: customer.id, customerId: customer.id });
    }

    const id = uuidv4();
    const normalizedPhone = phone ? phone.replace(/[\s\-\(\)]/g, '') : null;
    db.prepare(
      'INSERT INTO Customer (id, name, email, phone, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))'
    ).run(id, name || null, email || null, normalizedPhone);

    return NextResponse.json({ clientId: id, customerId: id });
  } catch (error) {
    return handleApiError(error, '/api/register-or-lookup');
  }
}
