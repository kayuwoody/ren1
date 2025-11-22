import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
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
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size in points
    const { width, height } = page.getSize();

    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50; // Start from top with margin

    // --- LETTERHEAD ---
    // Add logo if it exists
    const logoPath = path.join(process.cwd(), 'public', 'co line mascot.png');
    if (fs.existsSync(logoPath)) {
      try {
        const logoImage = fs.readFileSync(logoPath);
        const image = await pdfDoc.embedPng(logoImage);
        const logoWidth = 80;
        const logoHeight = (image.height / image.width) * logoWidth;
        page.drawImage(image, {
          x: 50,
          y: y - logoHeight,
          width: logoWidth,
          height: logoHeight,
        });
      } catch (error) {
        console.error('Failed to embed logo:', error);
        // Continue without logo
      }
    }

    // Company address (right-aligned)
    const addressLines = [
      'Cafe',
      '9ine Condominium',
      'Jalan Suria Residen 1/1',
      'Taman Kemacahaya',
      '43200 Cheras, Selangor',
    ];

    let addressY = y;
    addressLines.forEach((line) => {
      const textWidth = font.widthOfTextAtSize(line, 10);
      page.drawText(line, {
        x: width - 50 - textWidth,
        y: addressY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      addressY -= 14;
    });

    y -= 120; // Move down after letterhead

    // --- PURCHASE ORDER HEADER ---
    const titleText = 'PURCHASE ORDER';
    const titleWidth = fontBold.widthOfTextAtSize(titleText, 20);
    page.drawText(titleText, {
      x: (width - titleWidth) / 2,
      y: y,
      size: 20,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    y -= 30;

    const poText = `PO Number: ${purchaseOrder.poNumber}`;
    const poWidth = font.widthOfTextAtSize(poText, 12);
    page.drawText(poText, {
      x: (width - poWidth) / 2,
      y: y,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
    });

    y -= 40;

    // --- SUPPLIER & ORDER INFO ---
    // Left column - Supplier
    page.drawText('Supplier:', {
      x: 50,
      y: y,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(purchaseOrder.supplier, {
      x: 50,
      y: y - 15,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Right column - Order details
    let rightY = y;
    if (purchaseOrder.orderDate) {
      page.drawText('Order Date:', {
        x: 350,
        y: rightY,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText(new Date(purchaseOrder.orderDate).toLocaleDateString('en-MY'), {
        x: 350,
        y: rightY - 15,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      rightY -= 30;
    }

    if (purchaseOrder.expectedDeliveryDate) {
      page.drawText('Expected Delivery:', {
        x: 350,
        y: rightY,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText(
        new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString('en-MY'),
        {
          x: 350,
          y: rightY - 15,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        }
      );
    }

    y -= 60;

    // --- LINE ITEMS TABLE ---
    // Table header
    page.drawText('Item', {
      x: 50,
      y: y,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText('Quantity', {
      x: 320,
      y: y,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText('Unit Cost', {
      x: 400,
      y: y,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText('Total', {
      x: 480,
      y: y,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    y -= 5;

    // Draw header line
    page.drawLine({
      start: { x: 50, y: y },
      end: { x: width - 50, y: y },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    y -= 20;

    // Table rows
    for (const item of purchaseOrder.items) {
      // Check if we need a new page
      if (y < 100) {
        const newPage = pdfDoc.addPage([595, 842]);
        y = height - 50;
      }

      const itemName =
        item.itemType === 'material' ? item.materialName : item.productName;
      const notes = item.notes || '';

      // Item name
      page.drawText(itemName || '', {
        x: 50,
        y: y,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Notes (if any)
      if (notes) {
        page.drawText(notes, {
          x: 50,
          y: y - 12,
          size: 8,
          font: font,
          color: rgb(0.4, 0.4, 0.4),
        });
      }

      // Quantity
      page.drawText(`${item.quantity} ${item.unit}`, {
        x: 320,
        y: y,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Unit cost
      page.drawText(`RM ${item.unitCost.toFixed(2)}`, {
        x: 400,
        y: y,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Total
      const totalText = `RM ${item.totalCost.toFixed(2)}`;
      const totalWidth = font.widthOfTextAtSize(totalText, 10);
      page.drawText(totalText, {
        x: width - 50 - totalWidth,
        y: y,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      y -= notes ? 35 : 25;

      // Draw row line
      page.drawLine({
        start: { x: 50, y: y + 5 },
        end: { x: width - 50, y: y + 5 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
    }

    y -= 15;

    // --- TOTAL ---
    page.drawText('TOTAL:', {
      x: 400,
      y: y,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const totalAmountText = `RM ${purchaseOrder.totalAmount.toFixed(2)}`;
    const totalAmountWidth = fontBold.widthOfTextAtSize(totalAmountText, 12);
    page.drawText(totalAmountText, {
      x: width - 50 - totalAmountWidth,
      y: y,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    y -= 40;

    // --- NOTES ---
    if (purchaseOrder.notes && y > 100) {
      page.drawText('Notes:', {
        x: 50,
        y: y,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      y -= 15;

      // Word wrap notes
      const notesLines = wrapText(purchaseOrder.notes, 500, font, 10);
      notesLines.forEach((line) => {
        if (y < 100) return; // Stop if we're out of space
        page.drawText(line, {
          x: 50,
          y: y,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        });
        y -= 14;
      });
    }

    // --- FOOTER ---
    const footerText = `Generated on ${new Date().toLocaleDateString('en-MY')} at ${new Date().toLocaleTimeString('en-MY')}`;
    const footerWidth = font.widthOfTextAtSize(footerText, 8);
    page.drawText(footerText, {
      x: (width - footerWidth) / 2,
      y: 30,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Serialize the PDF to bytes
    const pdfBytes = await pdfDoc.save();

    // Return PDF as response
    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PO-${purchaseOrder.poNumber}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/[id]/pdf');
  }
}

/**
 * Helper function to wrap text for a given width
 */
function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
