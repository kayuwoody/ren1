import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getAllProducts } from '@/lib/db/productService';
import { getAllMaterials } from '@/lib/db/materialService';
import { handleApiError } from '@/lib/api/error-handler';

interface StockCheckItem {
  id: string;
  type: 'product' | 'material';
  name: string;
  sku?: string;
  category: string;
  supplier: string;
  currentStock: number;
  unit: string;
}

/**
 * Sanitize text to only include WinAnsi-compatible characters
 */
function sanitizeText(text: string): string {
  if (!text) return '';
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim();
}

/**
 * GET /api/admin/stock-check/pdf
 *
 * Generate a PDF stock take sheet grouped by supplier
 */
export async function GET() {
  try {
    const products = getAllProducts();
    const materials = getAllMaterials();

    const items: StockCheckItem[] = [];

    // Add products that have stock management enabled
    for (const product of products) {
      if (product.manageStock) {
        items.push({
          id: product.id,
          type: 'product',
          name: product.name,
          sku: product.sku,
          category: product.category,
          supplier: product.supplier || 'Unassigned',
          currentStock: product.stockQuantity,
          unit: 'pcs',
        });
      }
    }

    // Add all materials
    for (const material of materials) {
      items.push({
        id: material.id,
        type: 'material',
        name: material.name,
        category: material.category,
        supplier: material.supplier || 'Unassigned',
        currentStock: material.stockQuantity,
        unit: material.purchaseUnit,
      });
    }

    // Group by supplier
    const groupedBySupplier = items.reduce((acc, item) => {
      const supplier = item.supplier;
      if (!acc[supplier]) {
        acc[supplier] = [];
      }
      acc[supplier].push(item);
      return acc;
    }, {} as Record<string, StockCheckItem[]>);

    // Sort suppliers (put "Unassigned" at the end)
    const sortedSuppliers = Object.keys(groupedBySupplier).sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });

    // Sort items within each supplier by name
    for (const supplier of sortedSuppliers) {
      groupedBySupplier[supplier].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595; // A4 width
    const pageHeight = 842; // A4 height
    const margin = 40;
    const contentWidth = pageWidth - 2 * margin;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // --- HEADER ---
    const title = 'STOCK CHECK SHEET';
    const titleWidth = fontBold.widthOfTextAtSize(title, 18);
    page.drawText(title, {
      x: (pageWidth - titleWidth) / 2,
      y: y,
      size: 18,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 25;

    // Date
    const dateText = `Date: ${new Date().toLocaleDateString('en-MY')}`;
    const dateWidth = font.widthOfTextAtSize(dateText, 10);
    page.drawText(dateText, {
      x: (pageWidth - dateWidth) / 2,
      y: y,
      size: 10,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 15;

    // Instructions
    const instructions = 'Write counted stock in the "Counted" column. Add notes for discrepancies.';
    const instructionsWidth = font.widthOfTextAtSize(instructions, 9);
    page.drawText(instructions, {
      x: (pageWidth - instructionsWidth) / 2,
      y: y,
      size: 9,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 30;

    // Column widths
    const colItem = 180;
    const colCategory = 70;
    const colUnit = 40;
    const colSystem = 55;
    const colCounted = 55;
    const colDiff = 45;
    const colNotes = contentWidth - colItem - colCategory - colUnit - colSystem - colCounted - colDiff;

    // Helper to check if we need a new page
    const checkNewPage = (neededSpace: number) => {
      if (y < margin + neededSpace) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        return true;
      }
      return false;
    };

    // Helper to draw table header
    const drawTableHeader = () => {
      let x = margin;

      // Header background
      page.drawRectangle({
        x: margin,
        y: y - 3,
        width: contentWidth,
        height: 18,
        color: rgb(0.9, 0.9, 0.9),
      });

      page.drawText('Item', { x, y, size: 9, font: fontBold, color: rgb(0, 0, 0) });
      x += colItem;
      page.drawText('Category', { x, y, size: 9, font: fontBold, color: rgb(0, 0, 0) });
      x += colCategory;
      page.drawText('Unit', { x, y, size: 9, font: fontBold, color: rgb(0, 0, 0) });
      x += colUnit;
      page.drawText('System', { x, y, size: 9, font: fontBold, color: rgb(0, 0, 0) });
      x += colSystem;
      page.drawText('Counted', { x, y, size: 9, font: fontBold, color: rgb(0, 0, 0) });
      x += colCounted;
      page.drawText('Diff', { x, y, size: 9, font: fontBold, color: rgb(0, 0, 0) });
      x += colDiff;
      page.drawText('Notes', { x, y, size: 9, font: fontBold, color: rgb(0, 0, 0) });

      y -= 20;

      // Header line
      page.drawLine({
        start: { x: margin, y: y + 2 },
        end: { x: pageWidth - margin, y: y + 2 },
        thickness: 1,
        color: rgb(0.3, 0.3, 0.3),
      });
    };

    // Draw each supplier group
    for (const supplier of sortedSuppliers) {
      const supplierItems = groupedBySupplier[supplier];

      // Check if we have enough space for supplier header + at least 2 items
      checkNewPage(80);

      // Supplier header
      page.drawRectangle({
        x: margin,
        y: y - 5,
        width: contentWidth,
        height: 22,
        color: rgb(0.2, 0.4, 0.6),
      });

      page.drawText(sanitizeText(supplier), {
        x: margin + 10,
        y: y,
        size: 11,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      const itemCount = `(${supplierItems.length} items)`;
      const itemCountWidth = font.widthOfTextAtSize(itemCount, 9);
      page.drawText(itemCount, {
        x: pageWidth - margin - 10 - itemCountWidth,
        y: y,
        size: 9,
        font: font,
        color: rgb(0.9, 0.9, 0.9),
      });

      y -= 30;

      // Table header
      drawTableHeader();

      // Items
      for (const item of supplierItems) {
        if (checkNewPage(40)) {
          // Redraw supplier header on new page
          page.drawRectangle({
            x: margin,
            y: y - 5,
            width: contentWidth,
            height: 22,
            color: rgb(0.2, 0.4, 0.6),
          });

          page.drawText(`${sanitizeText(supplier)} (continued)`, {
            x: margin + 10,
            y: y,
            size: 11,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          y -= 30;
          drawTableHeader();
        }

        let x = margin;

        // Item name (truncate if too long)
        let itemName = sanitizeText(item.name);
        const maxItemWidth = colItem - 5;
        while (font.widthOfTextAtSize(itemName, 9) > maxItemWidth && itemName.length > 3) {
          itemName = itemName.slice(0, -4) + '...';
        }
        page.drawText(itemName, { x, y, size: 9, font: font, color: rgb(0, 0, 0) });
        x += colItem;

        // Category
        const category = item.type === 'product' ? item.category : item.category;
        page.drawText(sanitizeText(category), { x, y, size: 8, font: font, color: rgb(0.3, 0.3, 0.3) });
        x += colCategory;

        // Unit
        page.drawText(sanitizeText(item.unit), { x, y, size: 9, font: font, color: rgb(0, 0, 0) });
        x += colUnit;

        // System stock
        const systemStock = item.currentStock.toFixed(item.unit === 'pcs' ? 0 : 1);
        page.drawText(systemStock, { x, y, size: 9, font: font, color: rgb(0, 0, 0) });
        x += colSystem;

        // Counted (empty box for writing)
        page.drawRectangle({
          x: x,
          y: y - 4,
          width: 45,
          height: 16,
          borderColor: rgb(0.6, 0.6, 0.6),
          borderWidth: 0.5,
        });
        x += colCounted;

        // Diff (empty box for writing)
        page.drawRectangle({
          x: x,
          y: y - 4,
          width: 35,
          height: 16,
          borderColor: rgb(0.6, 0.6, 0.6),
          borderWidth: 0.5,
        });
        x += colDiff;

        // Notes (empty box for writing)
        page.drawRectangle({
          x: x,
          y: y - 4,
          width: colNotes - 5,
          height: 16,
          borderColor: rgb(0.6, 0.6, 0.6),
          borderWidth: 0.5,
        });

        y -= 22;

        // Light separator line
        page.drawLine({
          start: { x: margin, y: y + 4 },
          end: { x: pageWidth - margin, y: y + 4 },
          thickness: 0.3,
          color: rgb(0.85, 0.85, 0.85),
        });
      }

      y -= 15; // Extra space between supplier groups
    }

    // Footer on last page
    const footerText = `Generated on ${new Date().toLocaleDateString('en-MY')} at ${new Date().toLocaleTimeString('en-MY')}`;
    const footerWidth = font.widthOfTextAtSize(footerText, 8);
    page.drawText(footerText, {
      x: (pageWidth - footerWidth) / 2,
      y: 25,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Signature line
    y = Math.min(y - 30, 100);
    if (y > 50) {
      page.drawText('Checked by: ____________________', {
        x: margin,
        y: 50,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('Date: ____________________', {
        x: pageWidth - margin - 150,
        y: 50,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
    }

    // Serialize the PDF
    const pdfBytes = await pdfDoc.save();

    const filename = `Stock-Check-${new Date().toISOString().split('T')[0]}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/stock-check/pdf');
  }
}
