import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get('search');

  let query = supabase
    .from('loyalty_members')
    .select('*')
    .order('updated_at', { ascending: false });

  if (search) {
    query = query.or(`phone.ilike.%${search}%,name.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { phone, name } = body;

  if (!phone) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('loyalty_members')
    .select('id')
    .eq('phone', phone)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Member with this phone already exists' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('loyalty_members')
    .insert({ phone, name: name || null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member: data }, { status: 201 });
}
