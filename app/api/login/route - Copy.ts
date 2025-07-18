import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';
import { randomUUID } from 'crypto';

console.log('🔥 /api/login route loaded');

type Mode = 'login' | 'register';

interface Incoming {
  mode?: Mode;              // 'login' or 'register' (default: 'login')
  email?: string;           // preferred explicit field
  input?: string;           // backward: accept this too
  phone?: string;           // will be converted to pseudo-email if used
  password?: string;        // optional: only used on register
}

/**
 * Normalize any of: email | input | phone
 * - If it contains "@", treat as email.
 * - Else if digits, synthesize a pseudo email for Woo: <digits>@guest.local
 */
function normalizeEmail(body: Incoming): string | null {
  const raw = body.email ?? body.input ?? body.phone ?? '';
  const cleaned = String(raw).trim();
  if (!cleaned) return null;
  if (cleaned.includes('@')) return cleaned.toLowerCase();
  // treat raw number/phone as pseudo-email
  const num = cleaned.replace(/[^0-9+]/g, '');
  return `${num}@guest.local`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Incoming;
    const email = normalizeEmail(body);
    const mode: Mode = body.mode === 'register' ? 'register' : 'login';

    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    console.log(`[API /login] mode=${mode} lookup email: ${email}`);

    // Lookup existing Woo customer
    const lookupResp = await wcApi.get('customers', { email });
    const existing = Array.isArray(lookupResp.data) ? lookupResp.data[0] : null;

    // ---- REGISTER MODE ----
    if (mode === 'register') {
      if (existing) {
        // user already exists → conflict
        return NextResponse.json(
          { error: 'Account already exists', code: 'ACCOUNT_EXISTS' },
          { status: 409 }
        );
      }

      const password = body.password || randomUUID(); // fallback if user skipped
      const createResp = await wcApi.post('customers', {
        email,
        username: email,
        password,
        billing: { email },
        shipping: { email },
      });
      const customer = createResp.data;
      console.log('[API /login] created Woo customer:', customer.id);

      // set session cookie
      const res = NextResponse.json({
        userId: customer.id,
        email: customer.email,
        created: true,
      });
      res.cookies.set('userId', String(customer.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        sameSite: 'lax',
      });
      return res;
    }

    // ---- LOGIN MODE ----
    if (!existing) {
      // no account found
      return NextResponse.json(
        { error: 'No account found', code: 'NO_ACCOUNT' },
        { status: 404 }
      );
    }

    // (Optional) TODO: verify password with Woo / WP auth plugin

    const res = NextResponse.json({
      userId: existing.id,
      email: existing.email,
      created: false,
    });
    res.cookies.set('userId', String(existing.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    });
    return res;
  } catch (err: any) {
    console.error('❌ /api/login error:', err?.response?.data || err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
