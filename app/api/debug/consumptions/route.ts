import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';

export async function GET() {
  try {
    const output: string[] = [];

    output.push('=== DATABASE DIAGNOSTIC ===\n');

    // Check total consumption records
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption').get() as { count: number };
    output.push(`Total consumption records in database: ${totalCount.count}\n`);

    if (totalCount.count > 0) {
      // Show all unique orderIds
      const uniqueOrders = db.prepare(`
        SELECT DISTINCT orderId, typeof(orderId) as type, COUNT(*) as count
        FROM InventoryConsumption
        GROUP BY orderId
        ORDER BY orderId DESC
        LIMIT 20
      `).all();

      output.push('Unique orderIds in database:');
      uniqueOrders.forEach((row: any) => {
        output.push(`  orderId=${row.orderId} (type: ${row.type}), records: ${row.count}`);
      });

      output.push('\n=== Testing specific queries ===');

      // Test different query methods for order 389
      const test389_string = db.prepare("SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = '389'").get() as { count: number };
      const test389_number = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = 389').get() as { count: number };
      const test389_param = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = ?').get('389') as { count: number };

      output.push(`Order 389:`);
      output.push(`  Query with '389' hardcoded string: ${test389_string.count} records`);
      output.push(`  Query with 389 hardcoded number: ${test389_number.count} records`);
      output.push(`  Query with ? param ('389'): ${test389_param.count} records`);

      // Test for order 390
      const test390_string = db.prepare("SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = '390'").get() as { count: number };
      const test390_number = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = 390').get() as { count: number };
      const test390_param = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = ?').get('390') as { count: number };

      output.push(`\nOrder 390:`);
      output.push(`  Query with '390' hardcoded string: ${test390_string.count} records`);
      output.push(`  Query with 390 hardcoded number: ${test390_number.count} records`);
      output.push(`  Query with ? param ('390'): ${test390_param.count} records`);

      // Show sample records
      output.push('\n=== Sample consumption records (most recent 10) ===');
      const samples = db.prepare('SELECT orderId, orderItemId, productName, totalCost, typeof(orderId) as orderIdType FROM InventoryConsumption ORDER BY consumedAt DESC LIMIT 10').all();
      samples.forEach((rec: any) => {
        output.push(`  Order ${rec.orderId} (${rec.orderIdType}), Item ${rec.orderItemId}, ${rec.productName}, RM ${rec.totalCost}`);
      });
    } else {
      output.push('\n⚠️  No consumption records found in database!');
    }

    output.push('\n=== END DIAGNOSTIC ===');

    return NextResponse.json({
      success: true,
      output: output.join('\n'),
      raw: {
        totalCount: totalCount.count,
      }
    });

  } catch (error: any) {
    console.error('Database diagnostic error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
