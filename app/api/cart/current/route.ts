import { NextResponse } from 'next/server';

/**
 * Current Cart API
 *
 * Simple in-memory cart storage for syncing between POS and customer display
 * In production, use Redis or similar for multi-instance deployments
 */

let currentCart: any[] = [];

export async function GET() {
  return NextResponse.json({ cart: currentCart });
}

export async function POST(req: Request) {
  try {
    const { cart } = await req.json();
    currentCart = cart || [];
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
