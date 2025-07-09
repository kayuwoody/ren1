import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// TEMP in-memory store (replace with DB or WooCommerce logic later)
const DB: Record<string, string> = {};

export async function POST(request: Request) {
  const { input } = await request.json();
  if (!input) {
    return NextResponse.json({ error: 'Missing input' }, { status: 400 });
  }

  // Normalize the input (email or phone)
  const key = input.trim().toLowerCase();

  // Lookup or generate clientId
  let clientId = DB[key];
  if (!clientId) {
    clientId = randomUUID();
    DB[key] = clientId;
  }

  return NextResponse.json({ clientId });
}
