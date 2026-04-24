import { NextResponse } from 'next/server';
import { supabase } from '@/lib/online/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const outlet = new URL(req.url).searchParams.get('outlet') ?? 'main';
  const { data: products, error } = await supabase
    .from('online_products')
    .select('id, name, category, price, available, stock_count, image_url')
    .eq('outlet_id', outlet).order('category').order('name');
  if (error) return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  return NextResponse.json({ products: products ?? [] });
}
