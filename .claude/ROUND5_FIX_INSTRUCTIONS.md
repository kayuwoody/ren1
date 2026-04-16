# Round 5 — Complete the WooCommerce Deprecation for Admin Routes

**Target branch:** `claude/review-session-state-vR06M`
**Origin:** This file. Read top-to-bottom, work through phases in order.

## Context

Round 3 claimed admin routes had been migrated to local SQLite. That was **wrong**. Seven admin routes still call WooCommerce, and the local `Order`/`OrderItem` tables are empty because `saveOrderLocally()` (defined in `lib/db/orderService.ts`) is never invoked.

User hit a runtime DNS error on an offline branch: `getaddrinfo ENOTFOUND coffee-oasis.com.my` from `/api/admin/sales`.

## Goal

1. Populate the local `Order`/`OrderItem` tables at order-creation time (dual-write: WC + local).
2. Migrate 5 order-based admin routes to read from local SQLite only.
3. Make the 2 non-order admin routes resilient to WC being offline.

**Non-goals:** Historical WC → local backfill. Removing WC from order *creation*. Full offline POS.

## Architectural invariants (do not change)

- Order creation still goes through `createWooOrder()` for now (WC is still the write path for orders).
- `saveOrderLocally()` fires *after* successful WC operations (order create / status change).
- Admin *read* routes query local DB only — they never touch WC.
- `getOrderConsumptions()` (from `inventoryConsumptionService.ts`) stays — it already queries local DB.
- Keep response shapes that frontends already consume.

---

## Phase 0 — Add helpers to `lib/db/orderService.ts`

Append these helpers (after the existing exports):

```typescript
/**
 * Parse the `variations` JSON blob on a LocalOrderItem.
 * Returns {} on parse failure or missing data.
 */
export function parseItemVariations(item: LocalOrderItem): Record<string, any> {
  if (!item.variations) return {};
  try {
    return JSON.parse(item.variations);
  } catch {
    return {};
  }
}

/**
 * Convert a LocalOrder + LocalOrderItem[] into a WooCommerce-shaped order
 * for backward compatibility with frontends that still expect WC shape.
 * Used by /api/admin/orders.
 */
export function toWcOrderShape(order: OrderWithItems): any {
  const metaData: any[] = [
    { key: '_branch_id', value: order.branchId },
    { key: '_final_total', value: String(order.total) },
  ];

  const lineItems = order.items.map((item) => {
    const v = parseItemVariations(item);
    const itemMeta: any[] = [];
    for (const [key, value] of Object.entries(v)) {
      if (value !== null && value !== undefined) {
        itemMeta.push({ key, value: String(value) });
      }
    }
    return {
      id: item.id,
      product_id: item.productId,
      name: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      price: item.finalPrice,
      total: String(item.finalPrice * item.quantity),
      meta_data: itemMeta,
    };
  });

  return {
    id: order.wcId ?? order.id,
    number: order.orderNumber,
    status: order.status,
    total: String(order.total),
    date_created: order.createdAt,
    customer_id: 0,
    billing: {
      first_name: order.customerName || 'Guest',
      phone: order.customerPhone || '',
      email: '',
    },
    line_items: lineItems,
    meta_data: metaData,
  };
}
```

---

## Phase 1 — Wire up `saveOrderLocally()` at order creation

### 1.1 `app/api/orders/create-with-payment/route.ts`

After `const order = await createWooOrder(...)` succeeds and before `return NextResponse.json(...)`:

```typescript
import { saveOrderLocally } from '@/lib/db/orderService';
// ...
try {
  saveOrderLocally(order, branchId);
} catch (err) {
  console.warn('⚠️ Failed to save order locally (WC save succeeded):', err);
}
```

Don't let a local save failure fail the order. Log and continue.

### 1.2 `app/api/update-order/[orderId]/route.ts`

After `const updated = await updateWooOrder(orderId, patchPayload)` and before `broadcastOrderUpdate()`:

```typescript
import { saveOrderLocally } from '@/lib/db/orderService';
// ...
try {
  const metaBranchId = (combinedMeta.find((m: any) => m.key === '_branch_id')?.value as string) || '';
  if (metaBranchId) {
    saveOrderLocally(updated, metaBranchId);
  }
} catch (err) {
  console.warn(`⚠️ Failed to save order ${orderId} locally:`, err);
}
```

`saveOrderLocally` is an upsert (checks existing by id/wcId and does UPDATE if found), so calling it on status change is safe.

### 1.3 Other order-write routes (check and add if present)

For each of these, after any WC mutation, add the same `saveOrderLocally(updated, branchId)` try/catch block:

- `app/api/orders/[orderId]/update-items/route.ts` — after WC update
- `app/api/orders/create/route.ts` — if exists and creates WC orders

Read each file first. Add `saveOrderLocally` only if it makes sense (i.e., the route actually performs a WC write). Don't add it to read-only routes.

---

## Phase 2 — Migrate the 5 order-based admin routes to local DB

### 2.1 `app/api/admin/sales/route.ts`

Replace the entire handler body (keep the file structure, exports, `dynamic = 'force-dynamic'`).

**Before:** calls `fetchAllWooPages('orders', ...)` then processes WC-shaped orders.
**After:** calls `getSaleOrders({ branchId, range, startDate, endDate, hideStaffMeals })`.

Outline:

```typescript
import { NextResponse } from 'next/server';
import { getSaleOrders, parseItemVariations } from '@/lib/db/orderService';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';

    const orders = getSaleOrders({
      branchId,
      range,
      startDate: startDateParam,
      endDate: endDateParam,
      hideStaffMeals,
    });

    // Aggregate
    let totalRevenue = 0;
    let totalDiscounts = 0;
    let totalCOGS = 0;
    let totalItemsSold = 0;
    const revenueByDay: Record<string, { revenue: number; orders: number; discounts: number; cogs: number; profit: number }> = {};
    const productStats: Record<string, { quantity: number; revenue: number; cogs: number; profit: number }> = {};
    const ordersByStatus: Record<string, number> = {};

    for (const order of orders) {
      const finalTotal = order.total;
      // Discount is sum of per-item discountApplied
      const discount = order.items.reduce((sum, it) => sum + (it.discountApplied || 0) * it.quantity, 0);

      let orderCOGS = 0;
      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(order.id);
        orderCOGS = orderConsumptions.reduce((sum, c) => sum + c.totalCost, 0);
      } catch {}

      totalRevenue += finalTotal;
      totalDiscounts += discount;
      totalCOGS += orderCOGS;

      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      if (!revenueByDay[orderDate]) {
        revenueByDay[orderDate] = { revenue: 0, orders: 0, discounts: 0, cogs: 0, profit: 0 };
      }
      revenueByDay[orderDate].revenue += finalTotal;
      revenueByDay[orderDate].orders += 1;
      revenueByDay[orderDate].discounts += discount;
      revenueByDay[orderDate].cogs += orderCOGS;
      revenueByDay[orderDate].profit += (finalTotal - orderCOGS);

      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;

      for (const item of order.items) {
        const v = parseItemVariations(item);
        const isBundle = v._is_bundle === 'true';
        const productName = isBundle && v._bundle_display_name ? v._bundle_display_name : item.productName;

        const itemRevenue = item.finalPrice * item.quantity;
        const itemConsumptions = orderConsumptions.filter(c => String(c.orderItemId) === String(item.id));
        const itemCOGS = itemConsumptions.reduce((sum, c) => sum + c.totalCost, 0);

        if (!productStats[productName]) {
          productStats[productName] = { quantity: 0, revenue: 0, cogs: 0, profit: 0 };
        }
        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += (itemRevenue - itemCOGS);
        totalItemsSold += item.quantity;
      }
    }

    const revenueByDayArray = Object.entries(revenueByDay)
      .map(([date, data]) => ({
        date, ...data,
        margin: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const topProducts = Object.entries(productStats)
      .map(([name, data]) => ({
        name, ...data,
        margin: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const ordersByStatusArray = Object.entries(ordersByStatus).map(([status, count]) => ({ status, count }));

    const totalProfit = totalRevenue - totalCOGS;
    const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return NextResponse.json({
      totalRevenue,
      totalOrders: orders.length,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      totalDiscounts,
      totalCOGS,
      totalProfit,
      overallMargin,
      totalItemsSold,
      averageItemPrice: totalItemsSold > 0 ? totalRevenue / totalItemsSold : 0,
      averageProfitPerItem: totalItemsSold > 0 ? totalProfit / totalItemsSold : 0,
      revenueByDay: revenueByDayArray,
      topProducts,
      ordersByStatus: ordersByStatusArray,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/sales');
  }
}
```

Keep the response shape identical to before so the frontend doesn't break.

### 2.2 `app/api/admin/sales/daily/route.ts`

Replace the handler. Use `getDayOrders({ branchId, date: dateParam })`.

The response shape is:
```ts
{
  date: string;
  summary: { totalOrders, totalRevenue, totalRetail, totalDiscounts, totalCOGS, totalProfit, overallMargin };
  orders: Array<{
    id, orderNumber, dateCreated, status, customerName,
    items: Array<{
      id, name, quantity, retailPrice, finalPrice, discountReason,
      itemTotal, itemCOGS, itemProfit, itemMargin,
      isBundle, baseProductName, components?
    }>,
    retailTotal, finalTotal, totalDiscount, orderCOGS, profit, margin
  }>;
}
```

Per item: `retailPrice` = `item.basePrice`, `finalPrice` = `item.finalPrice`. Bundle fields come from `parseItemVariations(item)`. `components` comes from `v._bundle_components` (JSON string, parse it).

### 2.3 `app/api/admin/orders/route.ts`

Replace handler. Use `getOrders({ branchId: showAll ? undefined : branchId, showAll })`.

The frontend (`app/admin/orders/page.tsx`) reads `order.line_items`, `order.meta_data`, `order.billing`, `order.date_created`, `order.total`, `order.status`, `order.id`.

**Solution:** return WC-shaped array by mapping each order through `toWcOrderShape()`:

```typescript
import { getOrders, getOrderItems, toWcOrderShape } from '@/lib/db/orderService';
// ...
const baseOrders = getOrders({ branchId: showAll ? undefined : branchId, showAll });
const withItems = baseOrders.map(o => ({ ...o, items: getOrderItems(o.id) }));
const shaped = withItems.map(toWcOrderShape);
return NextResponse.json(shaped);
```

### 2.4 `app/api/admin/daily-stats/route.ts`

Replace handler with:

```typescript
import { NextResponse } from 'next/server';
import { getDailyStats } from '@/lib/db/orderService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const stats = getDailyStats(branchId);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to fetch daily stats:', error);
    return NextResponse.json({
      todayOrders: 0, todayRevenue: 0, itemsSold: 0, pendingOrders: 0,
    });
  }
}
```

`getDailyStats` already returns the exact shape the frontend expects.

### 2.5 `app/api/admin/products-sold/route.ts`

Replace handler. Use `getSaleOrders({ branchId, range, startDate, endDate, hideStaffMeals })`. Iterate `order.items`, use `parseItemVariations(item)` for bundle metadata, compute product stats.

**Critical preservation:** Response shape is:
```ts
{
  summary: { totalProducts, totalItemsSold, totalRevenue, totalCOGS, totalProfit, overallMargin, totalDiscounts, avgPricePerItem, avgProfitPerItem },
  allProducts: Array<ProductData>,
  highlights: { topSelling, highestRevenue, highestProfit, bestMargin, worstMargin },
  dateRange: { start, end }
}
```

Per-item discount is proportional within an order. Use `item.discountApplied * item.quantity` to get per-item total discount; or sum per-item `discountApplied` proportionally like the original.

---

## Phase 3 — Non-order admin routes

### 3.1 `app/api/admin/customers/route.ts`

WC still authoritative for customers. Wrap in try/catch and return empty array on DNS/network error:

```typescript
import { NextResponse } from 'next/server';
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const customers = await fetchAllWooPages('customers', {
      orderby: 'registered_date',
      order: 'desc',
    });
    return NextResponse.json(customers);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const offline = msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED');
    if (offline) {
      console.warn('⚠️ /api/admin/customers: WooCommerce unreachable, returning empty list');
      return NextResponse.json([]);
    }
    return handleApiError(error, '/api/admin/customers');
  }
}
```

### 3.2 `app/api/admin/products/costs/route.ts`

Remove WC entirely. Products are in local DB. Use `getAllProducts()`:

```typescript
import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/db/productService';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const localProducts = getAllProducts();
    const transformed = localProducts.map((product) => {
      const currentPrice = product.basePrice;
      const unitCost = product.unitCost || 0;
      const grossProfit = currentPrice - unitCost;
      const grossMargin = currentPrice > 0 ? (grossProfit / currentPrice) * 100 : 0;
      return {
        id: product.id,
        wcId: product.wcId,
        name: product.name,
        sku: product.sku,
        category: product.category,
        currentPrice,
        unitCost,
        grossProfit,
        grossMargin,
        stockQuantity: product.stockQuantity || 0,
        imageUrl: product.imageUrl,
      };
    });
    return NextResponse.json({ products: transformed });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/costs');
  }
}
```

---

## Phase 4 — Verification

Run in order:

1. `npm run build` — must complete without TypeScript errors
2. Grep verification — no WC order calls remain in admin reporting:
   ```
   grep -rn "fetchAllWooPages\s*(\s*'orders'" app/api/admin/
   ```
   Expected: **zero matches**.
3. Grep verification — WC helper imports remain only where intended (`customers/route.ts`):
   ```
   grep -rn "woocommerce-helpers" app/api/admin/
   ```
   Expected: **only `app/api/admin/customers/route.ts`**.
4. `saveOrderLocally` is now called in at least `create-with-payment` and `update-order/[orderId]`:
   ```
   grep -rn "saveOrderLocally" app/api/
   ```
   Expected: **2+ matches**.

---

## Constraints

1. **Read before writing.** Always read a file before editing it. Preserve existing logging and comments.
2. **Don't change response shapes.** Frontends still read the exact field names listed above.
3. **Don't touch the POS flow (`createWooOrder`).** Dual-write only.
4. **Don't add new tests or documentation.** Not in scope.
5. **Commit to branch `claude/review-session-state-vR06M`.** Push when complete.
6. **Commit message:** `fix(admin): migrate admin reporting routes from WooCommerce to local SQLite` with body explaining the two-bug fix (saveOrderLocally wiring + route migration).

---

## Summary of files changed

| File | Change |
|---|---|
| `lib/db/orderService.ts` | Add `parseItemVariations()`, `toWcOrderShape()` helpers |
| `app/api/orders/create-with-payment/route.ts` | Call `saveOrderLocally` after WC create |
| `app/api/update-order/[orderId]/route.ts` | Call `saveOrderLocally` after WC update |
| `app/api/orders/[orderId]/update-items/route.ts` | Call `saveOrderLocally` after WC update (if route performs WC write) |
| `app/api/admin/sales/route.ts` | Migrate to `getSaleOrders()` |
| `app/api/admin/sales/daily/route.ts` | Migrate to `getDayOrders()` |
| `app/api/admin/orders/route.ts` | Migrate to `getOrders()` + `toWcOrderShape()` |
| `app/api/admin/daily-stats/route.ts` | Migrate to `getDailyStats()` |
| `app/api/admin/products-sold/route.ts` | Migrate to `getSaleOrders()` |
| `app/api/admin/customers/route.ts` | Graceful DNS-error fallback |
| `app/api/admin/products/costs/route.ts` | Remove WC sync, use local DB only |
