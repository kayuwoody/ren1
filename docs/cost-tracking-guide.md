# Cost Tracking & Profit Analytics Guide

## Overview

The Coffee Oasis POS now includes a comprehensive cost tracking and profit analytics system. This allows you to:
- Track Cost of Goods Sold (COGS) for each product
- Calculate profit margins automatically on every order
- Monitor inventory costs and stock movements
- Generate profit reports and insights

## Key Concepts

### COGS (Cost of Goods Sold)
The total cost to make or serve one unit of a product, including:
- **Ingredients**: Coffee beans, milk, sugar, syrups, etc.
- **Packaging**: Cups, lids, bags, boxes
- **Consumables**: Napkins, straws, utensils

### Gross Profit
Selling Price - Unit Cost = Gross Profit

### Gross Margin
(Gross Profit / Selling Price) × 100 = Margin %

**Example:**
- Latte sells for RM 12.00
- Unit cost: RM 4.00 (beans + milk + cup + lid)
- Gross profit: RM 8.00
- Gross margin: 66.7%

## Data Storage Architecture

### WooCommerce (External)
- Product catalog (names, prices, SKUs)
- Customer orders
- Inventory quantities (optional)

### Local Database (SQLite)
- **Unit costs** (COGS per product)
- Cost breakdowns (detailed ingredient/packaging costs)
- Stock movements with cost tracking
- Order-level profit calculations
- Material costs (cups, lids, napkins, etc.)

**Important:** COGS data is stored **locally only**, not in WooCommerce. This gives you detailed cost tracking without cluttering your WooCommerce store.

## Getting Started

### 1. Initialize Database

The database is already created with the test script. If you need to reinitialize:

```bash
npx tsx lib/db/init.ts
```

### 2. Sync Products from WooCommerce

```bash
# Sync all products
npx tsx lib/db/wooSyncService.ts products

# Sync recent orders (last 30 days)
npx tsx lib/db/wooSyncService.ts orders

# Sync both
npx tsx lib/db/wooSyncService.ts all
```

**Note:** Products synced from WooCommerce will have unit cost = 0 initially. You need to set costs manually in the admin interface.

### 3. Set Product Costs

1. Go to **Admin Dashboard** → **Product Costs** (`/admin/costs`)
2. You'll see all products with their current costs
3. Products with RM 0.00 cost are highlighted in red with a ⚠️ warning
4. Click the **Edit** icon next to any product
5. Enter the unit cost (total COGS per item)
6. Click **Save**

The system will:
- Update the product's unit cost
- Calculate new profit margins
- Use this cost for all future orders

## Admin Interface

### `/admin/costs` - Product Cost Management

**Summary Cards:**
- Total Products count
- Average gross margin across all products
- Number of products needing cost setup

**Product Table:**
- Product name and SKU
- Category badge (beverage/food/merchandise)
- Current selling price
- Unit cost (COGS) - **editable inline**
- Gross profit (calculated)
- Gross margin % with color coding:
  - 🟢 Green: ≥60% margin (excellent)
  - 🟡 Yellow: 40-60% margin (good)
  - 🔴 Red: <40% margin (review pricing)

**Features:**
- Click Edit icon to modify unit cost
- Save/Cancel buttons for inline editing
- Color-coded warnings for products needing attention
- Help section explaining COGS concepts

## Using the API

### Get Product with Cost Info

```typescript
GET /api/admin/products/[productId]/cost

Response:
{
  "product": {
    "id": "abc123",
    "name": "Latte",
    "sku": "LAT-001",
    "currentPrice": 12.00,
    "unitCost": 4.00,
    "grossProfit": 8.00,
    "grossMargin": 66.7,
    ...
  }
}
```

### Update Product Cost

```typescript
PUT /api/admin/products/[productId]/cost
Content-Type: application/json

{
  "unitCost": 4.50
}

Response:
{
  "success": true,
  "product": { /* updated product */ }
}
```

### Update with Detailed Breakdown (Optional)

```typescript
PUT /api/admin/products/[productId]/cost
Content-Type: application/json

{
  "unitCost": 4.50,
  "costBreakdown": {
    "ingredientCosts": [
      { "ingredientId": "beans-001", "name": "Coffee Beans", "cost": 1.50 },
      { "ingredientId": "milk-001", "name": "Milk", "cost": 2.00 }
    ],
    "packagingCosts": [
      { "materialId": "cup-12oz", "name": "12oz Cup", "quantity": 1, "cost": 0.50 },
      { "materialId": "lid-12oz", "name": "12oz Lid", "quantity": 1, "cost": 0.30 }
    ],
    "consumables": [
      { "materialId": "napkin", "name": "Napkin", "cost": 0.10 },
      { "materialId": "straw", "name": "Straw", "cost": 0.10 }
    ]
  }
}
```

### List All Products with Costs

```typescript
GET /api/admin/products/costs

Response:
{
  "products": [
    {
      "id": "abc123",
      "name": "Latte",
      "unitCost": 4.00,
      "grossProfit": 8.00,
      "grossMargin": 66.7,
      "costBreakdown": { /* detailed breakdown if available */ },
      ...
    }
  ]
}
```

## Automatic Profit Tracking

When orders are created (either synced from WooCommerce or created directly), the system:

1. **Captures COGS at time of sale**
   - Uses the current `unitCost` for each product
   - Stores it in the order for historical accuracy
   - Even if costs change later, old orders maintain original cost data

2. **Calculates per-item profit**
   ```
   Item Profit = (Unit Price × Quantity) - (Unit Cost × Quantity)
   Item Margin = (Item Profit / Item Subtotal) × 100
   ```

3. **Aggregates order-level profit**
   ```
   Total COGS = Sum of all item costs
   Gross Profit = Order Total - Total COGS
   Gross Margin = (Gross Profit / Order Total) × 100
   ```

4. **Stores everything for reporting**
   - Individual item margins
   - Order profitability
   - Daily/weekly/monthly aggregates

## Programmatic Usage

### Create Products

```typescript
import { upsertProduct } from '@/lib/db/productService';

const espresso = upsertProduct({
  name: 'Espresso',
  category: 'beverage',
  sku: 'ESP-001',
  basePrice: 8.00,
  currentPrice: 8.00,
  stockQuantity: 100,
  lowStockThreshold: 20,
  unit: 'unit',
  unitCost: 2.50, // COGS
  isActive: true,
});
```

### Record Stock Movement

```typescript
import { recordStockMovement } from '@/lib/db/productService';

recordStockMovement({
  productId: espresso.id,
  type: 'purchase', // 'purchase' | 'sale' | 'waste' | 'adjustment'
  quantity: 50,
  previousStock: 100,
  newStock: 150,
  unitCost: 2.50,
  totalCost: 125.00,
  performedBy: 'admin-user',
  reason: 'Weekly restock',
});
```

### Create Order with Profit Tracking

```typescript
import { createOrder } from '@/lib/db/orderService';

const order = createOrder({
  orderNumber: 'ORD-001',
  customerId: 'customer-123',
  customerEmail: 'customer@example.com',
  items: [
    {
      productId: espresso.id,
      quantity: 2,
      unitPrice: 8.00,
    },
    {
      productId: latte.id,
      quantity: 1,
      unitPrice: 12.00,
    },
  ],
  totalDiscount: 2.00,
  tax: 1.30,
  paymentMethod: 'Credit Card',
  paymentStatus: 'paid',
  status: 'completed',
});

console.log(`Order Profit: RM ${order.grossProfit.toFixed(2)}`);
console.log(`Margin: ${order.grossMargin.toFixed(1)}%`);
```

### Get Order Statistics

```typescript
import { getOrderStats, getTopProducts } from '@/lib/db/orderService';

// Get stats for last 7 days
const stats = getOrderStats(
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  new Date().toISOString()
);

console.log(`Total Revenue: RM ${stats.totalRevenue.toFixed(2)}`);
console.log(`Total COGS: RM ${stats.totalCOGS.toFixed(2)}`);
console.log(`Gross Profit: RM ${stats.totalProfit.toFixed(2)}`);
console.log(`Average Margin: ${stats.averageMargin.toFixed(1)}%`);

// Get top 10 products
const topProducts = getTopProducts(
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  new Date().toISOString(),
  10
);

topProducts.forEach((product, idx) => {
  console.log(`${idx + 1}. ${product.productName}`);
  console.log(`   Quantity: ${product.totalQuantity}`);
  console.log(`   Revenue: RM ${product.totalRevenue.toFixed(2)}`);
  console.log(`   Profit: RM ${product.totalProfit.toFixed(2)}`);
});
```

## Testing

Run the test script to verify everything works:

```bash
npx tsx lib/db/test.ts
```

Expected output:
```
🧪 Testing database operations...

1️⃣  Creating test products...
✅ Created 3 products

2️⃣  Recording stock movement...
✅ Stock movement recorded

3️⃣  Creating test order...
✅ Order created: TEST-001
   Subtotal: RM 34.00
   Discount: RM 2.00
   Tax: RM 1.30
   Total: RM 33.30
   COGS: RM 11.00
   Gross Profit: RM 22.30
   Gross Margin: 67.0%

...
```

## Next Steps

### Phase 2: Material Costs (Packaging & Consumables)
- Add material inventory (cups, lids, napkins, straws)
- Track usage per product/order
- Calculate costs automatically

### Phase 3: Discounts & Promotions
- Discount code system
- Buy X Get Y deals
- Combo pricing
- Loyalty rewards

### Phase 4: Advanced Reporting
- Daily sales dashboard
- Product performance charts
- P&L statements
- Cost trend analysis
- Low margin alerts

### Phase 5: Integrations
- Connect order creation flow to use local database
- Real-time profit tracking during order entry
- Inventory alerts and reorder points
- Supplier management

## Troubleshooting

### Products not showing in /admin/costs

1. Check if database exists:
   ```bash
   ls -lh prisma/dev.db
   ```

2. Sync products from WooCommerce:
   ```bash
   npx tsx lib/db/wooSyncService.ts products
   ```

3. Or create test products:
   ```bash
   npx tsx lib/db/test.ts
   ```

### API returns 404 or 500 errors

1. Check server logs for detailed error messages
2. Verify database connection in `lib/db/init.ts`
3. Ensure product IDs are correct (use UUIDs, not WooCommerce IDs)

### Cost changes not reflecting

1. Hard refresh the admin page (Ctrl+Shift+R)
2. Check browser console for errors
3. Verify API response in Network tab

## Database Schema

Key tables:
- `Product` - Products with unit costs and pricing
- `StockMovement` - Audit trail of inventory changes
- `Order` - Orders with profit calculations
- `OrderItem` - Line items with per-item costs and margins
- `MaterialCost` - Packaging and consumables (future)
- `Discount` - Promotions and discount codes (future)
- `DailySales` - Aggregated daily reports (future)

See `prisma/schema.prisma` for full schema.

## Support

For issues or questions:
1. Check the logs: `npm run dev` output
2. Review the data model design: `docs/data-models.md`
3. Test with mock data: `npx tsx lib/db/test.ts`
