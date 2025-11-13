import { NextResponse } from 'next/server';
import { getPurchaseOrder } from '@/lib/db/purchaseOrderService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

/**
 * GET /api/purchase-orders/[id]/csv
 *
 * Export a purchase order to CSV format
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const purchaseOrder = getPurchaseOrder(params.id);

    if (!purchaseOrder) {
      return notFoundError(`Purchase order not found: ${params.id}`, '/api/purchase-orders/[id]/csv');
    }

    // Generate CSV content
    const headers = [
      'PO Number',
      'Supplier',
      'Status',
      'Order Date',
      'Expected Delivery',
      'Item Type',
      'Item Name',
      'SKU',
      'Quantity',
      'Unit',
      'Unit Cost (RM)',
      'Total Cost (RM)',
      'Notes',
    ];

    const rows: string[][] = [];

    // Add each item as a row
    for (const item of purchaseOrder.items) {
      rows.push([
        purchaseOrder.poNumber,
        purchaseOrder.supplier,
        purchaseOrder.status,
        purchaseOrder.orderDate || '',
        purchaseOrder.expectedDeliveryDate || '',
        item.itemType,
        item.itemType === 'material' ? item.materialName || '' : item.productName || '',
        item.sku || '',
        item.quantity.toString(),
        item.unit,
        item.unitCost.toFixed(2),
        item.totalCost.toFixed(2),
        item.notes || '',
      ]);
    }

    // Add totals row
    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'TOTAL:',
      `RM ${purchaseOrder.totalAmount.toFixed(2)}`,
      '',
    ]);

    // Add notes if present
    if (purchaseOrder.notes) {
      rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '']);
      rows.push(['Notes:', purchaseOrder.notes, '', '', '', '', '', '', '', '', '', '', '']);
    }

    // Convert to CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    // Return as downloadable file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="PO-${purchaseOrder.poNumber}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/[id]/csv');
  }
}
