import { NextResponse } from "next/server";
import { getBranchIdFromRequest } from "@/lib/api/branchHelper";
import { db } from "@/lib/db/init";
import { v4 as uuidv4 } from "uuid";
import { getProduct, getProductByWcId } from "@/lib/db/productService";
import { calculateProductCOGS } from "@/lib/db/inventoryConsumptionService";

/**
 * POST /api/orders/create-with-payment
 *
 * Creates an order in local SQLite. For physical retail, no payment
 * gateway is needed — payment is handled at the counter.
 *
 * Body params:
 * - line_items: Array of products to order
 * - userId: Customer ID (optional, local UUID)
 * - guestId: Guest session ID (optional)
 * - billing: Billing details (optional)
 * - meta_data: Additional metadata (optional)
 * - paymentMethod: 'cash' | 'card' | 'ewallet' etc (optional)
 */
export async function POST(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const body = await req.json();
    const { line_items, userId, guestId, billing, meta_data, paymentMethod } = body;

    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return NextResponse.json(
        { error: "line_items is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    const orderId = uuidv4();
    const now = new Date().toISOString();

    const nextNum = db.prepare('SELECT COUNT(*) as c FROM "Order"').get() as { c: number };
    const orderNumber = String(nextNum.c + 1);

    let subtotal = 0;
    let totalCost = 0;
    const itemRows: any[] = [];

    for (const item of line_items) {
      let product = getProduct(String(item.product_id));
      if (!product) {
        product = getProductByWcId(item.product_id);
      }
      const qty = item.quantity || 1;

      const getMeta = (metaArr: any[] | undefined, key: string) =>
        metaArr?.find((m: any) => m.key === key)?.value;

      const finalPrice = parseFloat(getMeta(item.meta_data, '_final_price') || item.price || product?.basePrice || '0');
      const retailPrice = parseFloat(getMeta(item.meta_data, '_retail_price') || item.price || product?.basePrice || '0');
      const discountApplied = retailPrice > finalPrice ? retailPrice - finalPrice : 0;
      const lineSubtotal = finalPrice * qty;
      subtotal += lineSubtotal;

      let unitCost = 0;
      if (product) {
        try {
          const cogs = calculateProductCOGS(item.product_id, 1);
          unitCost = cogs.totalCOGS || product.unitCost || 0;
        } catch {
          unitCost = product.unitCost || 0;
        }
      }
      const lineCost = unitCost * qty;
      totalCost += lineCost;

      const isBundle = getMeta(item.meta_data, '_is_bundle') === 'true';
      const bundleDisplayName = getMeta(item.meta_data, '_bundle_display_name');
      const displayName = isBundle && bundleDisplayName ? bundleDisplayName : (product?.name || item.name || 'Unknown');

      const variationsObj: Record<string, any> = {};
      if (isBundle) {
        variationsObj._is_bundle = 'true';
        variationsObj._bundle_display_name = bundleDisplayName;
        variationsObj._bundle_base_product_name = getMeta(item.meta_data, '_bundle_base_product_name');
        variationsObj._bundle_components = getMeta(item.meta_data, '_bundle_components');
      }
      const discountReason = getMeta(item.meta_data, '_discount_reason');
      if (discountReason) variationsObj._discount_reason = discountReason;
      variationsObj._retail_price = String(retailPrice);
      variationsObj._final_price = String(finalPrice);

      itemRows.push({
        id: uuidv4(),
        orderId,
        productId: product?.id || String(item.product_id),
        productName: displayName,
        category: product?.category || '',
        sku: product?.sku || item.sku || '',
        quantity: qty,
        basePrice: retailPrice,
        unitPrice: finalPrice,
        subtotal: lineSubtotal,
        unitCost,
        totalCost: lineCost,
        itemProfit: lineSubtotal - lineCost,
        itemMargin: lineSubtotal > 0 ? ((lineSubtotal - lineCost) / lineSubtotal) * 100 : 0,
        variations: JSON.stringify(variationsObj),
        discountApplied,
        finalPrice,
        branchId,
        soldAt: now,
      });
    }

    const totalProfit = subtotal - totalCost;
    const overallMargin = subtotal > 0 ? (totalProfit / subtotal) * 100 : 0;

    const insertAll = db.transaction(() => {
      console.log(`📝 Inserting Order: ${orderId}, branch: ${branchId}`);
      db.prepare(`
        INSERT INTO "Order" (id, orderNumber, status, customerName, customerPhone,
                             subtotal, tax, total, totalCost, totalProfit, overallMargin,
                             paymentMethod, branchId, customerId, guestId, createdAt, updatedAt)
        VALUES (?, ?, 'processing', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId, orderNumber,
        billing?.first_name || 'Walk-in',
        billing?.phone || null,
        subtotal, subtotal, totalCost, totalProfit, overallMargin,
        paymentMethod || 'cash',
        branchId, userId || null, guestId || null,
        now, now,
      );
      console.log(`✅ Order row inserted`);

      const insertItem = db.prepare(`
        INSERT INTO OrderItem (id, orderId, productId, productName, category, sku,
                               quantity, basePrice, unitPrice, subtotal, unitCost, totalCost,
                               itemProfit, itemMargin, variations, discountApplied, finalPrice,
                               branchId, soldAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of itemRows) {
        console.log(`📝 Inserting OrderItem: productId=${item.productId}, name=${item.productName}`);
        insertItem.run(
          item.id, item.orderId, item.productId, item.productName, item.category, item.sku,
          item.quantity, item.basePrice, item.unitPrice, item.subtotal, item.unitCost, item.totalCost,
          item.itemProfit, item.itemMargin, item.variations, item.discountApplied, item.finalPrice,
          item.branchId, item.soldAt,
        );
        console.log(`✅ OrderItem inserted: ${item.productName}`);
      }
    });

    insertAll();

    const order = {
      id: orderId,
      number: orderNumber,
      status: 'processing',
      total: String(subtotal),
      date_created: now,
      billing: billing || { first_name: 'Walk-in' },
      line_items: itemRows.map(item => ({
        id: item.id,
        product_id: item.productId,
        name: item.productName,
        quantity: item.quantity,
        price: item.finalPrice,
        total: String(item.subtotal),
        meta_data: item.variations ? Object.entries(JSON.parse(item.variations)).map(([key, value]) => ({ key, value: String(value) })) : [],
      })),
      meta_data: [
        { key: '_branch_id', value: branchId },
        { key: '_final_total', value: String(subtotal) },
      ],
    };

    console.log(`✅ Order created: #${orderNumber} (${orderId})`);

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error: any) {
    console.error("❌ Create order error:", error);
    return NextResponse.json(
      { error: "Failed to create order", details: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
