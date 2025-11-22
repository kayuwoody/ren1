import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { getPurchaseOrder } from '@/lib/db/purchaseOrderService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/purchase-orders/[id]/pdf
 *
 * Generate a PDF purchase order with letterhead
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const purchaseOrder = getPurchaseOrder(params.id);

    if (!purchaseOrder) {
      return notFoundError(`Purchase order not found: ${params.id}`, '/api/purchase-orders/[id]/pdf');
    }

    // Create a new PDF document
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    // Store PDF chunks in an array
    const chunks: Uint8Array[] = [];

    // Collect the PDF data
    doc.on('data', (chunk) => chunks.push(chunk));

    // Return a promise that resolves when the PDF is complete
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // --- LETTERHEAD ---
    // Add logo if it exists
    const logoPath = path.join(process.cwd(), 'public', 'co line mascot.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 100 });
    }

    // Company address (right-aligned)
    doc
      .fontSize(10)
      .text('Cafe', 400, 50, { align: 'right' })
      .text('9ine Condominium', { align: 'right' })
      .text('Jalan Suria Residen 1/1', { align: 'right' })
      .text('Taman Kemacahaya', { align: 'right' })
      .text('43200 Cheras, Selangor', { align: 'right' });

    // Move down after letterhead
    doc.moveDown(3);

    // --- PURCHASE ORDER HEADER ---
    doc
      .fontSize(20)
      .text('PURCHASE ORDER', 50, 160, { align: 'center' });

    doc
      .fontSize(12)
      .text(`PO Number: ${purchaseOrder.poNumber}`, { align: 'center' })
      .moveDown();

    // --- SUPPLIER & ORDER INFO ---
    const infoY = doc.y;

    // Left column - Supplier info
    doc.fontSize(11).text('Supplier:', 50, infoY);
    doc.fontSize(10).text(purchaseOrder.supplier, 50, doc.y);

    // Right column - Order details
    let rightColY = infoY;
    if (purchaseOrder.orderDate) {
      doc.fontSize(11).text('Order Date:', 350, rightColY);
      doc
        .fontSize(10)
        .text(new Date(purchaseOrder.orderDate).toLocaleDateString('en-MY'), 350, doc.y);
      rightColY = doc.y + 5;
    }

    if (purchaseOrder.expectedDeliveryDate) {
      doc.fontSize(11).text('Expected Delivery:', 350, rightColY);
      doc
        .fontSize(10)
        .text(
          new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString('en-MY'),
          350,
          doc.y
        );
    }

    doc.moveDown(2);

    // --- LINE ITEMS TABLE ---
    const tableTop = doc.y + 10;
    const itemHeight = 25;

    // Table header
    doc
      .fontSize(11)
      .text('Item', 50, tableTop)
      .text('Quantity', 320, tableTop)
      .text('Unit Cost', 400, tableTop)
      .text('Total', 480, tableTop, { align: 'right', width: 70 });

    // Draw header line
    doc
      .strokeColor('#000000')
      .lineWidth(1)
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    // Table rows
    let currentY = tableTop + 25;

    purchaseOrder.items.forEach((item, index) => {
      // Check if we need a new page
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      const itemName =
        item.itemType === 'material' ? item.materialName : item.productName;
      const notes = item.notes || '';

      // Item name and notes (single column)
      doc.fontSize(10).text(itemName || '', 50, currentY);

      if (notes) {
        doc.fontSize(8).fillColor('#666666').text(notes, 50, currentY + 12);
        doc.fillColor('#000000'); // Reset color
      }

      // Quantity
      doc
        .fontSize(10)
        .text(`${item.quantity} ${item.unit}`, 320, currentY);

      // Unit cost
      doc.text(`RM ${item.unitCost.toFixed(2)}`, 400, currentY);

      // Total
      doc.text(`RM ${item.totalCost.toFixed(2)}`, 480, currentY, {
        align: 'right',
        width: 70,
      });

      currentY += notes ? itemHeight + 10 : itemHeight;

      // Draw row line
      doc
        .strokeColor('#CCCCCC')
        .lineWidth(0.5)
        .moveTo(50, currentY - 5)
        .lineTo(550, currentY - 5)
        .stroke();
    });

    // --- TOTAL ---
    currentY += 10;

    doc
      .fontSize(12)
      .text('TOTAL:', 400, currentY)
      .text(`RM ${purchaseOrder.totalAmount.toFixed(2)}`, 480, currentY, {
        align: 'right',
        width: 70,
      });

    // --- NOTES ---
    if (purchaseOrder.notes) {
      currentY += 40;

      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      doc
        .fontSize(11)
        .text('Notes:', 50, currentY)
        .fontSize(10)
        .text(purchaseOrder.notes, 50, currentY + 15, { width: 500 });
    }

    // --- FOOTER ---
    const footerY = 750;
    doc
      .fontSize(8)
      .fillColor('#666666')
      .text(
        `Generated on ${new Date().toLocaleDateString('en-MY')} at ${new Date().toLocaleTimeString('en-MY')}`,
        50,
        footerY,
        { align: 'center', width: 500 }
      );

    // Finalize the PDF
    doc.end();

    // Wait for PDF to be generated
    const pdfBuffer = await pdfPromise;

    // Return PDF as response
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PO-${purchaseOrder.poNumber}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/[id]/pdf');
  }
}
