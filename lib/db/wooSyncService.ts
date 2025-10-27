/**
 * WooCommerce Sync Service
 * Syncs products and orders between WooCommerce and local database
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { wcApi } from '../wooClient';
import { upsertProduct, getProductByWooId, Product } from './productService';
import { createOrder, getOrderByWooId, CreateOrderInput } from './orderService';

// ============================================================================
// Product Sync
// ============================================================================

/**
 * Sync a single product from WooCommerce
 */
export async function syncProduct(wooProduct: any): Promise<Product> {
  const existing = wooProduct.id ? getProductByWooId(wooProduct.id) : null;

  // Determine category from WooCommerce categories
  const category = wooProduct.categories?.[0]?.slug || 'merchandise';

  // Use existing unitCost if available, otherwise default to 0 (to be set manually)
  const unitCost = existing?.unitCost || 0;

  const productData = {
    id: existing?.id,
    woocommerceId: wooProduct.id,
    name: wooProduct.name,
    category,
    sku: wooProduct.sku || `WOO-${wooProduct.id}`,
    basePrice: parseFloat(wooProduct.regular_price || wooProduct.price || '0'),
    currentPrice: parseFloat(wooProduct.price || wooProduct.regular_price || '0'),
    stockQuantity: parseFloat(wooProduct.stock_quantity || '0'),
    lowStockThreshold: 10, // Default threshold, can be configured
    unit: 'unit', // Default unit, can be customized per product
    unitCost,
    isActive: wooProduct.status === 'publish',
  };

  return upsertProduct(productData);
}

/**
 * Sync all products from WooCommerce
 */
export async function syncAllProducts(options: {
  per_page?: number;
  page?: number;
} = {}): Promise<{ synced: number; errors: number }> {
  console.log('🔄 Syncing products from WooCommerce...');

  let synced = 0;
  let errors = 0;
  let page = options.page || 1;
  const per_page = options.per_page || 100;

  try {
    while (true) {
      const { data: products } = await wcApi.get('products', {
        per_page,
        page,
      });

      if (!products || products.length === 0) {
        break;
      }

      for (const wooProduct of products) {
        try {
          await syncProduct(wooProduct);
          synced++;
          console.log(`  ✅ Synced: ${wooProduct.name}`);
        } catch (error: any) {
          errors++;
          console.error(`  ❌ Failed to sync ${wooProduct.name}:`, error.message);
        }
      }

      // Check if there are more pages
      if (products.length < per_page) {
        break;
      }

      page++;
    }

    console.log(`✅ Product sync complete: ${synced} synced, ${errors} errors`);
  } catch (error: any) {
    console.error('❌ Product sync failed:', error.message);
    throw error;
  }

  return { synced, errors };
}

// ============================================================================
// Order Sync
// ============================================================================

/**
 * Sync a single order from WooCommerce
 */
export async function syncOrder(wooOrder: any): Promise<void> {
  // Check if order already exists
  const existing = getOrderByWooId(wooOrder.id);
  if (existing) {
    console.log(`  ⏭️  Order ${wooOrder.number} already synced, skipping...`);
    return;
  }

  // Map WooCommerce line items to our order items
  const items = [];

  for (const lineItem of wooOrder.line_items) {
    // Find product by WooCommerce ID
    const product = getProductByWooId(lineItem.product_id);

    if (!product) {
      console.warn(`  ⚠️  Product ${lineItem.product_id} not found for order ${wooOrder.number}, skipping item...`);
      continue;
    }

    items.push({
      productId: product.id,
      quantity: lineItem.quantity,
      unitPrice: parseFloat(lineItem.price),
      variations: lineItem.variation_id ? { variationId: lineItem.variation_id } : undefined,
      discountApplied: 0, // Will be calculated from order-level discounts
    });
  }

  if (items.length === 0) {
    console.warn(`  ⚠️  No valid items for order ${wooOrder.number}, skipping...`);
    return;
  }

  // Calculate discount per item (proportional)
  const totalDiscount = parseFloat(wooOrder.discount_total || '0');
  const orderSubtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  if (totalDiscount > 0 && orderSubtotal > 0) {
    items.forEach(item => {
      const itemSubtotal = item.unitPrice * item.quantity;
      item.discountApplied = (itemSubtotal / orderSubtotal) * totalDiscount;
    });
  }

  const orderInput: CreateOrderInput = {
    woocommerceId: wooOrder.id,
    orderNumber: wooOrder.number,
    customerId: wooOrder.customer_id ? String(wooOrder.customer_id) : undefined,
    customerEmail: wooOrder.billing?.email,
    items,
    totalDiscount,
    tax: parseFloat(wooOrder.total_tax || '0'),
    paymentMethod: wooOrder.payment_method_title || 'Unknown',
    paymentStatus: mapWooPaymentStatus(wooOrder.status),
    status: mapWooOrderStatus(wooOrder.status),
  };

  try {
    createOrder(orderInput);
    console.log(`  ✅ Synced order: ${wooOrder.number}`);
  } catch (error: any) {
    console.error(`  ❌ Failed to sync order ${wooOrder.number}:`, error.message);
    throw error;
  }
}

/**
 * Sync recent orders from WooCommerce
 */
export async function syncRecentOrders(options: {
  per_page?: number;
  after?: string; // ISO date string
} = {}): Promise<{ synced: number; errors: number; skipped: number }> {
  console.log('🔄 Syncing orders from WooCommerce...');

  let synced = 0;
  let errors = 0;
  let skipped = 0;
  let page = 1;
  const per_page = options.per_page || 50;

  try {
    while (true) {
      const params: any = {
        per_page,
        page,
        orderby: 'date',
        order: 'desc',
      };

      if (options.after) {
        params.after = options.after;
      }

      const { data: orders } = await wcApi.get('orders', params);

      if (!orders || orders.length === 0) {
        break;
      }

      for (const wooOrder of orders) {
        try {
          // Check if already exists
          if (getOrderByWooId(wooOrder.id)) {
            skipped++;
            continue;
          }

          await syncOrder(wooOrder);
          synced++;
        } catch (error: any) {
          errors++;
          console.error(`  ❌ Error syncing order ${wooOrder.number}:`, error.message);
        }
      }

      // Check if there are more pages
      if (orders.length < per_page) {
        break;
      }

      page++;
    }

    console.log(`✅ Order sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors`);
  } catch (error: any) {
    console.error('❌ Order sync failed:', error.message);
    throw error;
  }

  return { synced, errors, skipped };
}

// ============================================================================
// Helpers
// ============================================================================

function mapWooPaymentStatus(wooStatus: string): 'pending' | 'paid' | 'refunded' {
  switch (wooStatus) {
    case 'completed':
    case 'processing':
    case 'on-hold':
      return 'paid';
    case 'refunded':
      return 'refunded';
    default:
      return 'pending';
  }
}

function mapWooOrderStatus(wooStatus: string): 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled' {
  switch (wooStatus) {
    case 'pending':
    case 'on-hold':
      return 'pending';
    case 'processing':
      return 'processing';
    case 'ready-to-pickup':
      return 'ready';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'refunded':
    case 'failed':
      return 'cancelled';
    default:
      return 'pending';
  }
}

// ============================================================================
// CLI Commands
// ============================================================================

if (require.main === module) {
  const command = process.argv[2];

  async function main() {
    try {
      if (command === 'products') {
        await syncAllProducts();
      } else if (command === 'orders') {
        // Sync orders from the last 30 days by default
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        await syncRecentOrders({ after: thirtyDaysAgo.toISOString() });
      } else if (command === 'all') {
        await syncAllProducts();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        await syncRecentOrders({ after: thirtyDaysAgo.toISOString() });
      } else {
        console.log('Usage: npx tsx lib/db/wooSyncService.ts [products|orders|all]');
        process.exit(1);
      }

      process.exit(0);
    } catch (error: any) {
      console.error('❌ Sync failed:', error.message);
      process.exit(1);
    }
  }

  main();
}
