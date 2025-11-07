import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';
import { randomUUID } from 'crypto';
import { handleApiError, validationError } from '@/lib/api/error-handler';

console.log('🔥 /api/login route loaded (passwordless)');

type Incoming = {
  email?: string;
  input?: string;
  phone?: string;
};

/** Normalize any email / input / phone to an email string Woo accepts */
function normalizeEmail(body: Incoming): string | null {
  const raw = body.email ?? body.input ?? body.phone ?? '';
  const cleaned = String(raw).trim();
  if (!cleaned) return null;
  if (cleaned.includes('@')) return cleaned.toLowerCase();
  const num = cleaned.replace(/[^0-9+]/g, '');
  return `${num}@guest.local`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Incoming;
    const email = normalizeEmail(body);
    if (!email) {
      return validationError('Missing email', '/api/login');
    }

    // Lookup
    const { data: found } = (await wcApi.get('customers', { email })) as { data: any };
    let customer = Array.isArray(found) ? found[0] : null;
    let created = false;

    // Create if missing
    if (!customer) {
      const password = randomUUID(); // throwaway
      const { data: createdCust } = (await wcApi.post('customers', {
        email,
        username: email,
        password,
        billing: { email },
        shipping: { email },
      })) as { data: any };
      customer = createdCust;
      created = true;
      console.log('[API /login] created Woo customer:', customer.id);
    } else {
      console.log('[API /login] existing Woo customer:', customer.id);
    }

    const userId = customer.id;
    const res = NextResponse.json({ userId, email: customer.email, created });

    // 30‑day session cookie
    res.cookies.set('userId', String(userId), {
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
