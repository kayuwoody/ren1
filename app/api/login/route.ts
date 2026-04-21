import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { v4 as uuidv4 } from 'uuid';
import { handleApiError, validationError } from '@/lib/api/error-handler';

console.log('🔥 /api/login route loaded (passwordless)');

type Incoming = {
  email?: string;
  input?: string;
  phone?: string;
};

function normalizePhone(body: Incoming): string | null {
  const raw = body.phone ?? body.input ?? body.email ?? '';
  const cleaned = String(raw).trim();
  if (!cleaned) return null;
  if (cleaned.includes('@')) return cleaned.toLowerCase();
  return cleaned.replace(/[^0-9+]/g, '');
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Incoming;
    const identifier = normalizePhone(body);
    if (!identifier) {
      return validationError('Missing phone or email', '/api/login');
    }

    const isEmail = identifier.includes('@');
    let customer = db.prepare(
      isEmail
        ? 'SELECT * FROM Customer WHERE email = ?'
        : 'SELECT * FROM Customer WHERE phone = ?'
    ).get(identifier) as any;

    let created = false;

    if (!customer) {
      const id = uuidv4();
      db.prepare(
        'INSERT INTO Customer (id, phone, email, createdAt, updatedAt) VALUES (?, ?, ?, datetime("now"), datetime("now"))'
      ).run(id, isEmail ? null : identifier, isEmail ? identifier : null);
      customer = { id, phone: isEmail ? null : identifier, email: isEmail ? identifier : null };
      created = true;
    }

    const res = NextResponse.json({ userId: customer.id, email: customer.email, phone: customer.phone, created });

    res.cookies.set('userId', customer.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    });

    return res;
  } catch (error) {
    return handleApiError(error, '/api/login');
  }
}
