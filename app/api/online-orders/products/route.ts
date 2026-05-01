import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const PRODUCTS = [
  { id: 'flat', name: 'Flat White', price: 10.50, category: 'coffee' },
  { id: 'latte', name: 'Oasis Latte', price: 11.00, category: 'coffee' },
  { id: 'kopi', name: 'Kopi-O Gula Melaka', price: 8.50, category: 'coffee' },
  { id: 'esp', name: 'Espresso', price: 7.00, category: 'coffee' },
  { id: 'ame', name: 'Americano', price: 8.50, category: 'coffee' },
  { id: 'cap', name: 'Cappuccino', price: 10.50, category: 'coffee' },
  { id: 'moch', name: 'Mocha', price: 12.00, category: 'coffee' },
  { id: 'matcha', name: 'Matcha Latte', price: 12.50, category: 'non-coffee' },
  { id: 'choc', name: 'Hot Chocolate', price: 11.00, category: 'non-coffee' },
  { id: 'chai', name: 'Spiced Chai', price: 10.00, category: 'non-coffee' },
  { id: 'icel', name: 'Iced Latte', price: 11.00, category: 'coffee' },
  { id: 'frap', name: 'Coffee Frappe', price: 13.50, category: 'coffee' },
  { id: 'cold', name: 'Cold Brew', price: 12.00, category: 'coffee' },
  { id: 'danish', name: 'Butter Danish', price: 6.50, category: 'food' },
  { id: 'crois', name: 'Almond Croissant', price: 7.50, category: 'food' },
  { id: 'muf', name: 'Blueberry Muffin', price: 6.00, category: 'food' },
  { id: 'kayab', name: 'Kaya Butter Toast', price: 5.50, category: 'food' },
  { id: 'c1', name: 'Kopi + Toast', price: 13.00, category: 'combo' },
  { id: 'c2', name: 'Latte + Danish', price: 15.00, category: 'combo' },
];

export async function GET() {
  try {
    const { data: rows, error } = await supabase
      .from('online_products')
      .select('id, available, stock_count')
      .eq('outlet_id', 'main');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const dbMap = new Map((rows ?? []).map(r => [r.id, r]));

    const products = PRODUCTS.map(p => {
      const row = dbMap.get(p.id);
      return {
        ...p,
        available: row ? row.available !== false : true,
        stock_count: row?.stock_count ?? null,
      };
    });

    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { productId, available } = await req.json();

    if (!productId || typeof available !== 'boolean') {
      return NextResponse.json({ error: 'productId and available (boolean) required' }, { status: 400 });
    }

    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) {
      return NextResponse.json({ error: 'Unknown product ID' }, { status: 400 });
    }

    const upsertData: Record<string, unknown> = {
      id: productId,
      outlet_id: 'main',
      name: product.name,
      category: product.category,
      price: product.price,
      available,
    };
    if (available) {
      upsertData.stock_count = null;
    }

    const { error } = await supabase
      .from('online_products')
      .upsert(upsertData, { onConflict: 'id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, productId, available });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update availability' }, { status: 500 });
  }
}
