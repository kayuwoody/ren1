# CRITICAL FUNCTIONS - DO NOT MODIFY WITHOUT APPROVAL

**⚠️ IMPORTANT: These functions handle money, inventory, and core business logic.**
**Before modifying ANY function in this file, you MUST:**
1. Check git history: `git log --all -S "function_name" -- file_path`
2. Verify it's not already working correctly
3. Ask the user for explicit approval

---

## 💰 Money & Payment Functions

### 1. Order Line Item Creation (Discounts + Bundle Metadata)
**Files:**
- `app/payment/page.tsx` (lines 34-67)
- `lib/orderService.ts` (WooLineItem type)

**Critical Code:**
```typescript
line_items: cartItems.map((item) => {
  const meta_data: Array<{ key: string; value: string }> = [];

  // Add discount metadata if applicable
  if (item.discountReason) {
    meta_data.push(
      { key: "_discount_reason", value: item.discountReason },
      { key: "_retail_price", value: item.retailPrice.toString() },
      { key: "_discount_amount", value: (item.retailPrice - item.finalPrice).toString() }
    );
  }

  // CRITICAL: Always add final price
  meta_data.push({ key: "_final_price", value: item.finalPrice.toString() });

  // CRITICAL: Add bundle metadata for COGS filtering
  if (item.bundle) {
    meta_data.push(
      { key: "_is_bundle", value: "true" },
      { key: "_bundle_display_name", value: item.name },
      { key: "_bundle_base_product_name", value: item.bundle.baseProductName },
      { key: "_bundle_mandatory", value: JSON.stringify(item.bundle.selectedMandatory) },
      { key: "_bundle_optional", value: JSON.stringify(item.bundle.selectedOptional) }
    );
  }

  return {
    product_id: item.productId,
    quantity: item.quantity,
    subtotal: (item.finalPrice * item.quantity).toString(), // CRITICAL: Must use finalPrice
    total: (item.finalPrice * item.quantity).toString(),    // CRITICAL: Not retailPrice!
    meta_data,
  };
})
```

**Why Critical:**
- **Pricing:** WooCommerce uses `subtotal` and `total` fields (not `price`). Using `retailPrice` instead of `finalPrice` charges full price
- **Bundle COGS:** Without bundle metadata, consumption records include ALL variants (Hot+Iced) instead of selected variant
- **Daily Sales:** Bundle metadata enables correct COGS filtering in reports

**Last Working Commits:**
- Discount capture: `5aeb308`
- Bundle metadata: `7066506`

**Test Scenarios:**
1. **Discount Test:**
   - Add product with 20% discount (RM 10.00 → RM 8.00)
   - Verify WooCommerce order total is RM 8.00
2. **Bundle COGS Test:**
   - Add Iced Latte to cart
   - Complete order
   - Check daily sales: COGS should only include Iced materials (not Hot+Iced combined)

---

### 2. Cash Payment Display
**File:** `app/payment/page.tsx` (line 116)

**Critical Code:**
```typescript
<CashPayment
  orderID={order.id}
  amount={finalTotal.toFixed(2)}  // CRITICAL: Use finalTotal, NOT order.total
  paymentMethod={paymentMethod}
/>
```

**Why Critical:**
- `order.total` from WooCommerce may not match discounted price
- `finalTotal` is calculated from cart with actual discounts
- Wrong value = customer charged incorrect amount

**Last Working Commit:** `8c97008` (Fix cash payment to show discounted price)

**Test Scenario:**
1. Cart with RM 50.00 discounted to RM 40.00
2. Select cash payment
3. Verify cash payment screen shows RM 40.00 (not RM 50.00)

---

### 3. Post-Payment Redirect
**File:** `app/payment/page.tsx` (line 82)

**Critical Code:**
```typescript
router.push("/admin/pos");  // CRITICAL: Admin workflow, not customer-facing /orders
```

**Why Critical:**
- Admin workflow requires returning to POS after payment
- Redirecting to `/orders` (customer page) breaks workflow

**Last Working Commit:** `4728031` (Redirect to admin POS after payment)

---

## 📦 Inventory & COGS Functions

### 4. Nested Product COGS Calculation
**File:** `lib/db/inventoryConsumptionService.ts` (lines 426-550)

**Critical Function:**
```typescript
export function calculateProductCOGS(
  wcProductId: string | number,
  quantity: number,
  bundleSelection?: {                    // CRITICAL: XOR filtering for bundle products
    selectedMandatory: Record<string, string>;
    selectedOptional: string[];
  },
  depth: number = 0,                     // CRITICAL: Recursive depth tracking
  parentChain: string = ''
)
```

**Why Critical:**
- **MUST recursively expand linked products to actual materials**
- **MUST filter by bundle selection** (XOR groups like Hot vs Iced)
- Example: Iced Latte → Only Iced packaging (NOT Hot+Iced combined) → Espresso → Coffee Beans
- Without recursion, COGS is wrong for any product with nested linked products
- Without bundle filtering, shows combined cost of all variants

**Dependencies:**
- `getProductByWcId()` - Find product by WooCommerce ID
- `getProductRecipe()` - Get product's recipe
- `getProduct()` - Get linked product details
- **Recursively calls itself** for linked products (depth + 1)

**XOR Filtering Logic (lines 492-503):**
```typescript
if (depth === 0 && bundleSelection && item.selectionGroup) {
  const selectedItemId = bundleSelection.selectedMandatory[item.selectionGroup];
  const isSelected = item.linkedProductId === selectedItemId;
  if (!isSelected) {
    return; // Skip non-selected variant
  }
}
```

**Last Working Commits:**
- Nested COGS: `ad29146`
- Bundle filtering: `7066506`

**Test Scenario:**
```
Latte (RM 12.00)
├─ Milk: 250ml @ RM 0.02/ml = RM 5.00
├─ [from Espresso]
│  └─ Coffee Beans: 12g @ RM 0.10/g = RM 1.20
└─ [from Hot]
   ├─ Cup: 1 @ RM 0.50 = RM 0.50
   ├─ Lid: 1 @ RM 0.20 = RM 0.20
   └─ Sleeve: 1 @ RM 0.10 = RM 0.10

Total COGS = RM 7.00 (all materials shown, not just "Espresso: RM 1.20")
```

**⚠️ NEVER:**
- Remove `depth` or `parentChain` parameters
- Remove recursive call for linked products (lines 504-510)
- Flatten the breakdown (must show all materials with depth tracking)

---

### 5. Inventory Consumption Recording
**File:** `lib/db/inventoryConsumptionService.ts` (lines 35-264)

**Critical Function:**
```typescript
export function recordProductSale(
  orderId: string,
  wcProductId: string | number,
  productName: string,
  quantitySold: number,
  orderItemId?: string,
  bundleSelection?: {                    // CRITICAL: XOR filtering for bundle products
    selectedMandatory: Record<string, string>;
    selectedOptional: string[];
  },
  depth: number = 0,                     // CRITICAL: Recursive depth
  parentChain: string = ''
)
```

**Why Critical:**
- **MUST recursively deduct materials from stock** for nested products
- **MUST filter by bundle selection** (XOR groups like Hot vs Iced)
- Records consumption history for COGS reporting
- Deducts materials from inventory

**Dependencies:**
- `getProductByWcId()` - Find product
- `getProductRecipe()` - Get recipe
- `deductMaterialStock()` - Update inventory
- **Recursively calls itself** for linked products (lines 242-252)

**XOR Filtering Logic (lines 158-171):**
```typescript
if (depth === 0 && bundleSelection && recipeItem.selectionGroup) {
  const selectedItemId = bundleSelection.selectedMandatory[recipeItem.selectionGroup];
  const isSelected = recipeItem.linkedProductId === selectedItemId;
  if (!isSelected) {
    return; // Skip non-selected variant - don't deduct its materials!
  }
}
```

**Last Working Commits:**
- Inventory recursion: `d0d489d`
- Bundle filtering: Verified in session 011CUuTiUmBCgpKEL4iJdCow

**Test Scenario:**
1. Sell 1 Iced Latte (bundle product)
2. Verify consumption records show:
   - Milk: -250ml
   - Coffee Beans: -12g (from nested Espresso)
   - Iced cup: -1 (from Iced variant)
   - Iced lid: -1
   - Straw: -1
3. Verify Hot packaging NOT deducted (Cup, Hot Lid, Sleeve)
4. Check daily sales: COGS only includes Iced materials

**⚠️ NEVER:**
- Remove recursion for linked products
- Remove bundleSelection handling (breaks XOR logic)
- Skip deductMaterialStock() calls
- Remove XOR filtering (causes wrong materials to be deducted)

---

### 6. Recipe Cost Calculation
**File:** `lib/db/recipeService.ts` (lines 342-391)

**Critical Function:**
```typescript
export function updateProductTotalCost(
  productId: string,
  visited = new Set<string>()  // CRITICAL: Prevents infinite loops
)
```

**Why Critical:**
- **MUST update linked products FIRST (recursively)** before parent
- Ensures dependency order: materials → linked products → parent products
- Without this, nested product costs are stale/incorrect

**Algorithm:**
1. Check visited set (prevent infinite loops)
2. Get product recipe
3. **Recursively update all linked products first** (lines 352-356)
4. Recalculate this product's recipe items with fresh costs (lines 359-378)
5. Sum total cost and update product (lines 381-390)

**Dependencies:**
- `getProductRecipe()` - Get recipe
- `getMaterial()` - Get material costs
- `getProduct()` - Get linked product costs
- **Recursively calls itself** for dependencies

**Last Working Commit:** `ad29146` (Fix nested COGS calculation)

**Test Scenario:**
1. Change coffee beans cost from RM 0.10/g to RM 0.15/g
2. Call `updateProductTotalCost(latteId)`
3. Verify Espresso cost updates first (12g × RM 0.15 = RM 1.80)
4. Verify Latte cost then updates using new Espresso cost
5. Result: RM 7.60 total (not stale RM 7.00)

**⚠️ NEVER:**
- Remove visited set (causes infinite loops)
- Remove recursive update of linked products
- Calculate costs without refreshing linked products first

---

### 7. Recalculate All Products
**File:** `lib/db/recipeService.ts` (lines 338-349)

**Critical Function:**
```typescript
export function recalculateAllProductCosts(): void
```

**Why Critical:**
- Ensures all products have accurate costs after material price changes
- Uses `updateProductTotalCost()` which handles dependencies automatically

**When to Use:**
- After bulk material price updates
- After fixing recipe data
- During database migrations

**Last Working Commit:** `ad29146` (Fix nested COGS calculation)

---

## 📋 Order Flow Functions

### 8. Order Status Management
**Files:**
- `app/kitchen/page.tsx` (lines 88-143)
- `app/delivery/page.tsx` (lines 52-85)

**Critical Logic:**
```typescript
// Kitchen: Ready for Pickup
const status = readyType === "pickup" ? "ready-for-pickup" : "processing";

// Delivery: Delivered
status: "ready-for-pickup"  // NOT "completed"
```

**Why Critical:**
- Pickup orders: `processing` → `ready-for-pickup` → `completed`
- Delivery orders: `processing` → delivered → `ready-for-pickup` → `completed`
- Using wrong status = orders disappear or appear in wrong screens

**Last Working Commits:**
- `cc5897c` (Kitchen ready-for-pickup flow)
- Delivery flow documented in session

**Test Scenario:**
1. Create pickup order → Kitchen marks "Ready Pickup"
2. Verify status = `ready-for-pickup` (not `processing`)
3. Create delivery order → Kitchen marks "Ready Delivery"
4. Verify status = `processing` + `out_for_delivery=yes`
5. Driver marks delivered → Verify status = `ready-for-pickup`

---

### 9. POS Customer Assignment
**File:** `lib/posCustomer.ts` (lines 24-29)

**Critical Code:**
```typescript
const response: any = await wcApi.get('customers', {
  email: POS_EMAIL,
  role: 'all',  // CRITICAL: Must include shop_manager, not just customer role
  per_page: 1
});
```

**Why Critical:**
- POS admin account has `shop_manager` role
- Without `role: 'all'`, search fails and orders aren't assigned

**Last Working Commit:** Merged from `claude/investigate-prompt-length-limits-011CUscrj7tKttaUgVY7sxrP`

**Test Scenario:**
1. Create walk-in order
2. Verify assigned to `pos-admin@coffee-oasis.com.my`
3. Check WooCommerce order customer_id matches shop manager

---

## 🧪 Test Before Modifying

Before changing ANY function above:

```bash
# 1. Check git history
git log --all -S "function_name" -- path/to/file.ts

# 2. See what changed
git show <commit_hash>:path/to/file.ts

# 3. If recursion/depth exists, DO NOT REMOVE IT
grep -n "depth\|recursive" path/to/file.ts

# 4. Ask user before proceeding
```

---

## 🔍 Common Anti-Patterns to Avoid

### ❌ DON'T: Remove recursion
```typescript
// WRONG - Only goes 1 level deep
recipe.forEach(item => {
  breakdown.push(item);  // Missing nested materials!
});
```

### ✅ DO: Keep recursion
```typescript
// CORRECT - Expands all nested materials
recipe.forEach(item => {
  if (item.itemType === 'product' && item.linkedProductId) {
    const linkedCOGS = calculateProductCOGS(
      linkedProduct.wcId,
      quantity,
      depth + 1,  // Track depth
      chain       // Track parent chain
    );
    breakdown.push(...linkedCOGS.breakdown);
  }
});
```

---

### ❌ DON'T: Use WooCommerce calculated totals for discounts
```typescript
// WRONG - WooCommerce doesn't know about POS discounts
amount={order.total}
```

### ✅ DO: Use cart-calculated totals
```typescript
// CORRECT - Cart has actual discounted prices
amount={finalTotal.toFixed(2)}
```

---

### ❌ DON'T: Update costs without updating dependencies first
```typescript
// WRONG - Stale linked product costs
const totalCost = recipe.reduce((sum, item) => sum + item.calculatedCost, 0);
```

### ✅ DO: Update dependencies first (bottom-up)
```typescript
// CORRECT - Fresh costs from bottom up
recipe.forEach(item => {
  if (item.itemType === 'product' && item.linkedProductId) {
    updateProductTotalCost(item.linkedProductId, visited);  // Dependencies first!
  }
});
// Then calculate this product's cost
```

---

## 📝 Session Checklist for AI Assistants

Before modifying code in this file:

- [ ] Read CRITICAL_FUNCTIONS.md (this file)
- [ ] Search git history for the function
- [ ] Verify the function isn't already working
- [ ] Check if recursion/depth tracking exists
- [ ] Ask user for approval if function is listed here
- [ ] After changes, run manual test scenarios
- [ ] Document any NEW critical functions discovered

---

## 🆘 If Something Breaks

1. **Check git history:**
   ```bash
   git log --all --oneline -- path/to/file.ts
   ```

2. **Compare with last working version:**
   ```bash
   git diff <last_working_commit> HEAD -- path/to/file.ts
   ```

3. **Revert if needed:**
   ```bash
   git checkout <last_working_commit> -- path/to/file.ts
   ```

4. **Critical commit references:**
   - COGS recursion: `ad29146`
   - Discount capture: `5aeb308`
   - Cash payment: `8c97008`
   - POS redirect: `4728031`
   - Inventory recursion: `d0d489d`

---

**Last Updated:** Session 011CUuTiUmBCgpKEL4iJdCow
**Maintainer:** User (business logic owner)
**Purpose:** Prevent accidental breakage of critical money/inventory functions
