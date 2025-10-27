# Coffee Oasis POS - Data Models

## Overview
Comprehensive data model for tracking inventory, costs, sales, and profitability.

---

## 1. Products & Inventory

### Product Model
```typescript
interface Product {
  id: string;
  woocommerceId?: number;
  name: string;
  category: 'beverage' | 'food' | 'merchandise';
  sku: string;

  // Pricing
  basePrice: number;
  currentPrice: number;  // May differ due to promotions

  // Inventory
  stockQuantity: number;
  lowStockThreshold: number;
  unit: 'unit' | 'kg' | 'g' | 'ml' | 'L';

  // Cost tracking
  costOfGoodsId: string;  // Links to COGS

  // Status
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Stock Movement Log
```typescript
interface StockMovement {
  id: string;
  productId: string;
  type: 'purchase' | 'sale' | 'waste' | 'adjustment';
  quantity: number;
  previousStock: number;
  newStock: number;

  // Cost tracking
  unitCost?: number;  // For purchases
  totalCost?: number;

  // References
  orderId?: string;  // If from sale
  purchaseOrderId?: string;  // If from restock

  reason?: string;
  performedBy: string;
  timestamp: Date;
}
```

---

## 2. Cost of Goods Sold (COGS)

### Primary Ingredients
```typescript
interface IngredientCost {
  id: string;
  productId: string;
  name: string;  // e.g., "Espresso Beans", "Milk", "Sugar"

  // Cost structure
  ingredients: {
    ingredientId: string;
    ingredientName: string;
    quantity: number;
    unit: string;
    costPerUnit: number;
    totalCost: number;
  }[];

  totalIngredientCost: number;
  lastUpdated: Date;
}
```

### Secondary Materials (Packaging, Consumables)
```typescript
interface MaterialCost {
  id: string;
  name: string;
  category: 'packaging' | 'consumable' | 'supplies';

  // Examples:
  // - packaging: cups, lids, sleeves, bags, boxes
  // - consumable: napkins, utensils, straws, stirrers
  // - supplies: cleaning supplies, paper towels

  costPerUnit: number;
  unit: string;
  supplier?: string;
  stockQuantity: number;

  // Usage tracking
  usageRate?: {
    perOrder?: number;  // Average per order
    perProduct?: Record<string, number>;  // Specific to products
  };

  lastPurchaseDate?: Date;
  lastPurchaseCost?: number;
}
```

### Product Total Cost
```typescript
interface ProductCostBreakdown {
  productId: string;

  // Primary costs
  ingredientCosts: {
    ingredientId: string;
    name: string;
    cost: number;
  }[];
  totalIngredientCost: number;

  // Secondary costs (per serving)
  packagingCosts: {
    materialId: string;
    name: string;
    quantity: number;
    cost: number;
  }[];
  totalPackagingCost: number;

  // Other variable costs
  consumables: {
    materialId: string;
    name: string;
    cost: number;
  }[];
  totalConsumableCost: number;

  // Total COGS
  totalCost: number;

  // Margin calculations
  sellingPrice: number;
  grossProfit: number;
  grossMargin: number;  // Percentage

  calculatedAt: Date;
}
```

---

## 3. Discounts & Promotions

### Discount Model
```typescript
interface Discount {
  id: string;
  code?: string;  // Optional promo code
  name: string;
  description: string;

  // Discount type
  type: 'percentage' | 'fixed_amount' | 'buy_x_get_y' | 'combo';

  // Discount value
  value: number;  // Percentage (0-100) or fixed amount

  // Conditions
  minPurchaseAmount?: number;
  maxDiscount?: number;  // Cap for percentage discounts
  applicableProducts?: string[];  // Empty = all products
  applicableCategories?: string[];

  // Combo details (if type = 'combo')
  comboItems?: {
    productId: string;
    quantity: number;
  }[];
  comboPrice?: number;

  // Buy X Get Y details
  buyQuantity?: number;
  getQuantity?: number;
  getProductId?: string;  // If different from buy product

  // Validity
  startDate: Date;
  endDate?: Date;
  isActive: boolean;

  // Usage limits
  maxUsesTotal?: number;
  maxUsesPerCustomer?: number;
  currentUses: number;

  // Priority (for stacking)
  priority: number;
  stackable: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

### Applied Discount (on Order)
```typescript
interface AppliedDiscount {
  discountId: string;
  discountName: string;
  type: string;
  amountSaved: number;
  appliedTo: 'order' | 'product';
  productIds?: string[];  // If applied to specific products
}
```

---

## 4. Orders & Sales

### Enhanced Order Model
```typescript
interface Order {
  id: string;
  woocommerceId?: number;
  orderNumber: string;

  // Customer
  customerId?: string;
  customerEmail?: string;

  // Items
  items: OrderItem[];

  // Financials
  subtotal: number;
  discounts: AppliedDiscount[];
  totalDiscount: number;
  tax: number;
  total: number;

  // Cost tracking
  totalCOGS: number;  // Sum of all item costs
  grossProfit: number;  // total - totalCOGS
  grossMargin: number;  // (grossProfit / total) * 100

  // Payment
  paymentMethod: string;
  paymentStatus: 'pending' | 'paid' | 'refunded';

  // Fulfillment
  status: 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';
  lockerSlot?: string;

  // Timestamps
  createdAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}
```

### Order Item
```typescript
interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;

  // Quantity & pricing
  quantity: number;
  unitPrice: number;
  subtotal: number;

  // Cost tracking
  unitCost: number;  // COGS per unit at time of sale
  totalCost: number;  // quantity * unitCost

  // Profit
  itemProfit: number;  // subtotal - totalCost
  itemMargin: number;  // (itemProfit / subtotal) * 100

  // Modifiers/variations
  variations?: {
    name: string;
    value: string;
    priceModifier?: number;
  }[];

  // Discounts (item-level)
  discountApplied?: number;
  finalPrice: number;
}
```

---

## 5. Reporting & Analytics

### Daily Sales Summary
```typescript
interface DailySales {
  date: Date;

  // Sales metrics
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;

  // Cost metrics
  totalCOGS: number;
  totalDiscounts: number;

  // Profit metrics
  grossProfit: number;
  grossMargin: number;

  // Product breakdown
  productSales: {
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
    cost: number;
    profit: number;
  }[];

  // Category breakdown
  categorySales: {
    category: string;
    revenue: number;
    orders: number;
  }[];

  // Top sellers
  topProducts: string[];

  // Waste/shrinkage
  wasteValue?: number;
}
```

### Product Performance Report
```typescript
interface ProductPerformance {
  productId: string;
  productName: string;
  period: {
    start: Date;
    end: Date;
  };

  // Sales metrics
  unitsSold: number;
  revenue: number;
  averagePrice: number;

  // Cost metrics
  totalCost: number;
  averageUnitCost: number;

  // Profit metrics
  totalProfit: number;
  averageProfit: number;
  profitMargin: number;

  // Trends
  salesTrend: 'increasing' | 'stable' | 'decreasing';
  percentChange: number;

  // Inventory
  currentStock: number;
  turnoverRate: number;
  daysUntilStockout?: number;
}
```

### Profit & Loss Statement
```typescript
interface ProfitLoss {
  period: {
    start: Date;
    end: Date;
  };

  // Revenue
  grossSales: number;
  discountsGiven: number;
  netSales: number;

  // Cost of Goods Sold
  beginningInventory: number;
  purchases: number;
  endingInventory: number;
  cogs: number;  // beginningInventory + purchases - endingInventory

  // Gross Profit
  grossProfit: number;  // netSales - cogs
  grossMarginPercent: number;

  // Operating Expenses (future expansion)
  labor?: number;
  rent?: number;
  utilities?: number;
  marketing?: number;
  other?: number;
  totalOperatingExpenses?: number;

  // Net Profit
  netProfit: number;
  netMarginPercent: number;
}
```

---

## 6. Database Schema Considerations

### Indexing Strategy
```sql
-- Products
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(is_active);

-- Stock movements
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, timestamp);
CREATE INDEX idx_stock_movements_type ON stock_movements(type, timestamp);

-- Orders
CREATE INDEX idx_orders_date ON orders(created_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- Order items
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Material costs
CREATE INDEX idx_material_costs_category ON material_costs(category);
```

### Data Retention
- **Stock movements**: Keep forever (audit trail)
- **Orders**: Keep forever (legal requirement)
- **Daily summaries**: Keep forever (reporting)
- **Detailed cost breakdowns**: Keep for 2 years
- **Discount usage logs**: Keep for 1 year

---

## Implementation Priority

### Phase 1: Core Cost Tracking
1. ✅ Products table with basic COGS
2. ✅ Order items with cost tracking
3. ✅ Basic profit calculations

### Phase 2: Inventory Management
1. Stock movement logging
2. Low stock alerts
3. Purchase order management
4. Reorder point calculations

### Phase 3: Advanced Costing
1. Material costs (packaging, consumables)
2. Full product cost breakdown
3. Cost variance tracking
4. Supplier management

### Phase 4: Discounts & Promotions
1. Basic discount codes
2. Combo deals
3. Buy X Get Y promotions
4. Loyalty program integration

### Phase 5: Reporting & Analytics
1. Daily sales summaries
2. Product performance reports
3. Profit & loss statements
4. Inventory valuation reports
5. Cost trend analysis

---

## Notes & Best Practices

### Cost Calculation
- Calculate COGS at time of sale (not dynamically)
- Store historical costs to track cost changes
- Update product costs when ingredient prices change
- Review and adjust material costs monthly

### Discount Application Order
1. Product-specific discounts
2. Category discounts
3. Order-level discounts
4. Loyalty rewards
5. Manual adjustments

### Profit Margin Targets
- Beverages: 70-80% gross margin
- Food items: 60-70% gross margin
- Overall target: 70%+ gross margin

### Stock Valuation Methods
- **FIFO** (First In, First Out): Recommended for perishables
- **Weighted Average**: Simpler, good for non-perishables
- **Actual Cost**: Most accurate but complex

### Reporting Frequency
- **Real-time**: Current stock levels, order status
- **Daily**: Sales summary, stock movements
- **Weekly**: Product performance, low stock alerts
- **Monthly**: P&L statement, cost variance analysis
- **Quarterly**: Trend analysis, pricing review
