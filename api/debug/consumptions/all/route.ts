import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError } from '@/lib/api/error-handler';

export async function GET() {
  try {
    // Get ALL consumption records
    const allRecords = db.prepare(`
      SELECT * FROM InventoryConsumption
      ORDER BY consumedAt DESC
    `).all();

    console.log(`\n=== ALL CONSUMPTION RECORDS (${allRecords.length} total) ===\n`);

    // Group by orderId for easier reading
    const byOrder: Record<string, any[]> = {};
    allRecords.forEach((rec: any) => {
      if (!byOrder[rec.orderId]) {
        byOrder[rec.orderId] = [];
      }
      byOrder[rec.orderId].push(rec);
    });

    const summary: string[] = [];
    summary.push(`Total consumption records: ${allRecords.length}\n`);
    summary.push(`Unique orders: ${Object.keys(byOrder).length}\n`);
    summary.push('Records by order:\n');

    // Sort orderIds descending
    const sortedOrderIds = Object.keys(byOrder).sort((a, b) => Number(b) - Number(a));

    sortedOrderIds.forEach(orderId => {
      const records = byOrder[orderId];
      const totalCost = records.reduce((sum, r) => sum + r.totalCost, 0);
      summary.push(`\nOrder ${orderId}: ${records.length} records, Total COGS = RM ${totalCost.toFixed(2)}`);

      records.forEach((rec, idx) => {
        summary.push(
          `  ${idx + 1}. orderItemId=${rec.orderItemId}, ` +
          `product="${rec.productName}", ` +
          `material="${rec.materialName}", ` +
          `cost=RM ${rec.totalCost.toFixed(2)}, ` +
          `consumed=${rec.consumedAt}`
        );
      });
    });

    const output = summary.join('\n');
    console.log(output);

    return NextResponse.json({
      success: true,
      totalRecords: allRecords.length,
      uniqueOrders: Object.keys(byOrder).length,
      orderIds: sortedOrderIds,
      summary: output,
      rawRecords: allRecords,
    });

  } catch (error) {
    return handleApiError(error, '/api/debug/consumptions/all');
  }
}
