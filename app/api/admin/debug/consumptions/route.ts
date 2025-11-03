import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');

    let query = 'SELECT * FROM InventoryConsumption';
    let params: any[] = [];

    if (orderId) {
      query += ' WHERE orderId = ?';
      params.push(orderId);
    }

    query += ' ORDER BY consumedAt DESC LIMIT 20';

    const stmt = db.prepare(query);
    const consumptions = stmt.all(...params);

    return NextResponse.json({
      success: true,
      consumptions,
    });
  } catch (error: any) {
    console.error('Debug consumptions error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
