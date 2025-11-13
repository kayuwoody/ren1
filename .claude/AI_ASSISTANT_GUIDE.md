# AI Assistant Guide - Coffee Oasis POS

**Read this FIRST before making any code changes.** This is your quick reference.

---

## Project Quick Facts

**What:** Coffee shop POS system with WooCommerce backend
**Stack:** Next.js 14 (App Router), TypeScript, WooCommerce REST API, SQLite (better-sqlite3)
**Currency:** Malaysian Ringgit (RM)
**Status:** Production ready, active development

**Key Business Logic:**
- Products have recipes (materials + linked products) for COGS tracking
- Orders track inventory consumption for cost analysis
- Bundle products have mandatory/optional selections stored in metadata
- Locker system for pickup (QR codes, webhooks)
- Loyalty points system

---

## CRITICAL: Helper Utilities (DO NOT RECREATE!)

### 1. Error Handling - `lib/api/error-handler.ts`

**Status:** ✅ Applied to all 39 API routes
**Rule:** ALWAYS use this, NEVER write manual error responses

```typescript
import { handleApiError, validationError, notFoundError, unauthorizedError } from '@/lib/api/error-handler';

// Validation errors (400)
if (!required) return validationError('Message', '/api/route');

// Not found (404)
if (!found) return notFoundError('Message', '/api/route');

// Unauthorized (401)
if (!authorized) return unauthorizedError('Message', '/api/route');

// Catch blocks
try { ... } catch (error) {
  return handleApiError(error, '/api/route');
}
```

**Why:** Eliminates 82% of error handling boilerplate, standardized HTTP codes, extracts WooCommerce API errors properly.

### 2. WooCommerce Pagination - `lib/api/woocommerce-helpers.ts`

**Status:** ✅ Applied to 9 routes (admin reports, product sync)
**Rule:** ALWAYS use this for WooCommerce API calls with pagination

```typescript
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';

// Fetches ALL pages automatically (no 100-item limit)
const allOrders = await fetchAllWooPages('orders', { status: 'processing' });
const allProducts = await fetchAllWooPages('products');
const allCustomers = await fetchAllWooPages('customers', {}, 50); // custom per_page
```

**Before:** 180 lines of boilerplate, capped at 100 items
**After:** ~30 lines, unlimited items

### 3. Metadata Extraction - `lib/api/woocommerce-helpers.ts`

**Rule:** Use this instead of manual `.find()` chains

```typescript
import { getMetaValue } from '@/lib/api/woocommerce-helpers';

const value = getMetaValue(order.meta_data, '_bundle_mandatory', '{}');
const custom = getMetaValue(product.meta_data, '_field', 'default');
```

---

## File Structure (Key Locations)

```
app/api/               # API routes - use error-handler.ts!
lib/
  api/
    error-handler.ts          # Error utilities (USE THIS!)
    woocommerce-helpers.ts    # Pagination & metadata (USE THIS!)
  db/
    init.ts                   # SQLite database instance
    inventoryConsumptionService.ts  # COGS tracking
    recipeService.ts          # Product BOM management
    productService.ts         # Product CRUD
    materialService.ts        # Raw materials CRUD
  orderService.ts             # WooCommerce order operations
  wooClient.ts                # WooCommerce API client
  loyaltyService.ts           # Points system

context/
  cartContext.tsx             # Shopping cart state

.env.local                    # API credentials (never commit!)
```

---

## Database Schema (SQLite)

**Key Tables:**
- `Product` - Synced from WooCommerce (wcId, name, sku, basePrice, unitCost, supplierCost)
- `Material` - Raw materials (name, category, purchaseUnit, purchaseCost, stockQuantity)
- `Recipe` - Product BOM (productId, materialId/linkedProductId, quantity, isOptional, selectionGroup)
- `InventoryConsumption` - COGS tracking (orderId, productName, materialName, totalCost)
- `Customer` - Loyalty (wcCustomerId, totalPoints)
- `LoyaltyTransaction` - Points history

**Important:**
- `prisma/dev.db` is in .gitignore (never commit!)
- Use direct SQL: `db.prepare('SELECT ...').all()` from `@/lib/db/init`

---

## WooCommerce Integration

### Order Metadata (Important!)

Orders store custom data in `meta_data` array:

**Line Item Metadata:**
- `_is_bundle` - Boolean string ("true") indicating bundle product
- `_bundle_display_name` - Display name (e.g., "Iced Latte")
- `_bundle_base_product_name` - Base product name (e.g., "Latte")
- `_bundle_mandatory` - JSON string of mandatory selections (XOR groups like Hot vs Iced)
- `_bundle_optional` - JSON array of optional add-ons
- `_discount_reason` - Reason for discount (e.g., "20% off")
- `_retail_price` - Original retail price before discount
- `_final_price` - Final price after discount
- `_discount_amount` - Amount discounted

**Order-Level Metadata:**
- `startTime` / `endTime` - Timer for kitchen display (2 min per item)
- `_pickup_timestamp` / `_pickup_locker` - Locker pickup details
- `_guestId` - For guest checkout orders
- `kitchen_ready` - Marks order ready for pickup/delivery
- `out_for_delivery` - Marks order ready for delivery

**Extracting metadata:**
```typescript
import { getMetaValue } from '@/lib/api/woocommerce-helpers';

const bundleMandatory = getMetaValue(item.meta_data, '_bundle_mandatory', '{}');
const parsed = JSON.parse(bundleMandatory); // Always validate JSON!
```

### Order Status Flow

```
pending → processing → ready-for-pickup → completed
```

- `pending`: Created, awaiting payment
- `processing`: Kitchen preparing (timer running)
- `ready-for-pickup`: In locker, QR code generated
- `completed`: Customer picked up

### WooCommerce API Error Handling

Errors nest in `response.data`. The `handleApiError()` function extracts them automatically:
- Checks `response.data.message`
- Checks `response.data.data.message`
- Returns proper HTTP status codes

---

## Authentication Patterns

### Registered Users
- `userId` in HTTP-only cookie (30 days)
- Mirrored to localStorage for client-side checks
- WooCommerce customer ID

### Guest Users
- `guestId` UUID in localStorage
- Stored in order metadata (`_guestId`)
- Browser-specific, not cross-device

### API Routes
```typescript
import { cookies } from 'next/headers';

const cookieStore = cookies();
const userId = cookieStore.get('userId')?.value;

if (!userId) {
  return unauthorizedError('Not authenticated', '/api/route');
}
```

---

## API Route Standard Pattern

```typescript
import { NextResponse } from 'next/server';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate early, return immediately
    if (!body.required) {
      return validationError('required field missing', '/api/route');
    }

    // Business logic
    const result = await doWork(body);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return handleApiError(error, '/api/route');
  }
}
```

**Key principles:**
- Validate early, fail fast
- Use helper utilities (no manual error responses!)
- Return `NextResponse.json()` for all responses
- Context string in `handleApiError()` should be route path

---

## Special Routes to Know

### Admin Routes (use fetchAllWooPages!)
- `/api/admin/sales/daily` - Daily sales report
- `/api/admin/orders` - All orders (unlimited pagination)
- `/api/admin/products` - Product sync from WooCommerce
- `/api/admin/materials` - Raw materials CRUD
- `/api/admin/recipes/[productId]` - Product BOM management

### Core User Routes
- `/api/create-order` - Order creation (handles bundles, timer metadata)
- `/api/orders/consumption` - Records inventory consumption for COGS
- `/api/login` - Passwordless auth (email/phone)
- `/api/products` - Product listing (fetches ALL, not just 100!)

### Utility Routes
- `/api/locker/unlock` - Webhook from locker (Bearer auth required)
- `/api/loyalty/points` - Get customer points balance
- `/api/loyalty/award` - Award points for actions

### Debug Routes (development only)
- `/api/debug/consumptions` - View inventory consumption records
- `/api/test-woo` - Test WooCommerce API connection

---

## Key Services

### Inventory Consumption (`lib/db/inventoryConsumptionService.ts`)
```typescript
import { recordProductSale, calculateProductCOGS } from '@/lib/db/inventoryConsumptionService';

// Record consumption when order created
const consumptions = recordProductSale(
  orderId,
  productId,
  productName,
  quantity,
  orderItemId,
  bundleSelection // optional
);

// Calculate COGS for order
const cogs = calculateProductCOGS(orderId);
```

### Recipe Service (`lib/db/recipeService.ts`)
```typescript
import { getProductRecipe, setProductRecipe } from '@/lib/db/recipeService';

// Get product BOM
const recipe = getProductRecipe(productId);
// Returns: [{ materialId, quantity, unit, calculatedCost, isOptional, selectionGroup }]

// Update recipe
setProductRecipe(productId, [
  { materialId: 'mat1', quantity: 100, unit: 'g', isOptional: false },
  { linkedProductId: 'prod2', quantity: 1, unit: 'unit', selectionGroup: 'Size' }
]);
```

### Purchase Order Service (`lib/db/purchaseOrderService.ts`)
```typescript
import {
  createPurchaseOrder,
  markPurchaseOrderReceived,
  getPurchaseOrder,
  generatePONumber
} from '@/lib/db/purchaseOrderService';

// Create new PO
const po = createPurchaseOrder({
  supplierName: 'Coffee Supplier Inc',
  orderDate: '2025-11-13',
  items: [
    {
      itemType: 'product',
      productId: 'prod123',
      quantity: 24,
      unit: 'units',
      notes: '1 ctn of 24'
    }
  ],
  notes: 'Deliver by 2PM'
});
// Auto-generates PO number: PO-2025-11-0001

// Mark as received (updates inventory + WooCommerce)
await markPurchaseOrderReceived(po.id);
// ⚠️ ASYNC - syncs stock to WooCommerce for products with wcId
```

### Order Service (`lib/orderService.ts`)
```typescript
import { getWooOrder, updateWooOrder } from '@/lib/orderService';

const order = await getWooOrder(orderId);
await updateWooOrder(orderId, { status: 'processing' });
```

---

## Git Workflow

**Branch naming:** `claude/initial-setup-*` (auto-generated session ID)
**Commits:** Clear, atomic changes with descriptive messages
**Push:** Only when user explicitly requests

**Never:**
- Force push to main/master
- Skip hooks (--no-verify)
- Commit `.env.local` or database files
- Push without user approval

**Example commit:**
```
Standardize error handling for order routes

Applied error-handler.ts utilities to 3 routes:
- orders/consumption: Validation, unified error handling
- orders/processing: Unified error handling
- orders/[orderId]/update-items: Validation for pending status

Eliminates ~40 lines of boilerplate error code.
```

---

## Common Tasks & Patterns

### Adding a New API Route
1. Check for similar route first (grep for patterns)
2. Import error handlers: `import { handleApiError, validationError } from '@/lib/api/error-handler'`
3. Use standard pattern (see above)
4. Add validation early
5. Use WooCommerce helpers if paginating

### Updating Existing Routes
1. Read the route first (ALWAYS!)
2. Check if it needs error handler migration
3. Check if it needs pagination helper
4. Preserve business logic, only refactor boilerplate
5. Test incrementally

### Working with WooCommerce
1. Use `fetchAllWooPages()` for any list endpoint
2. Use `getMetaValue()` for metadata extraction
3. Remember errors nest in `response.data`
4. Use `handleApiError()` to auto-extract WooCommerce errors

### Database Operations
1. Import db: `import { db } from '@/lib/db/init'`
2. Use prepared statements: `db.prepare('SELECT ...').all()`
3. Check service layers first (don't write raw SQL if service exists)
4. Never commit database files

---

## Phase 2 Optimization Progress

✅ **Task 1:** Pagination utility (`fetchAllWooPages`) - COMPLETE
✅ **Task 2:** Metadata helpers (`getMetaValue`) - COMPLETE
✅ **Task 3:** Error handling standardization (39/39 routes) - COMPLETE
⏸️ **Task 4:** Logging utility - DEFERRED

**Impact so far:**
- 82-86% reduction in error handling boilerplate
- Fixed 8 pagination bugs (routes capped at 100 items)
- Standardized HTTP status codes across all routes
- Consistent WooCommerce error extraction

---

## Testing & Debugging

**Environment modes:**
- `USE_MOCK_API=true` - Mock WooCommerce data (development)
- `USE_MOCK_API=false` - Real WooCommerce API (production)

**Common debugging:**
- Check terminal for API mode banner (MOCK vs LIVE)
- Use `/api/debug/*` routes for consumption records
- Check browser localStorage for userId/guestId
- Use `/api/test-woo` to verify WooCommerce connection

**User testing pattern:**
1. Make small batch of changes
2. Commit locally
3. User tests the changes
4. If good, continue; if issues, fix before moving forward
5. Push when user explicitly requests

---

## When You Start a New Session

1. **Read this file first** - `.claude/AI_ASSISTANT_GUIDE.md`
2. **⚠️ READ CRITICAL_FUNCTIONS.md** - `.claude/CRITICAL_FUNCTIONS.md` - DO NOT modify functions listed there without approval!
3. **Check for existing utilities** - grep before creating new helpers
4. **Search git history** - `git log --all -S "function_name"` before modifying
5. **Read similar routes** - understand patterns before changing
6. **Ask if unclear** - clarify requirements before coding
7. **Work incrementally** - small batches, frequent commits

---

## Full Project Documentation

For comprehensive project details, see: `PROJECT_DOCUMENTATION.md`

This guide is a concise reference. The full docs have:
- Complete user flows
- Detailed API specs
- Setup instructions
- Future enhancements roadmap
- Changelog

---

## Recent Changes (Session 011CUuTiUmBCgpKEL4iJdCow)

### Critical Bug Fixes

**1. Missing Import Crash Fix** ✅
- **File:** `app/api/orders/[orderId]/route.ts`
- **Issue:** `updateWooOrder` was called but not imported, causing crashes on order updates
- **Fix:** Added `updateWooOrder` to imports from `@/lib/orderService`

**2. Discount Price Capture Fix** ✅
- **Files:** `app/payment/page.tsx`, `lib/orderService.ts`
- **Issue:** WooCommerce ignored the `price` field, charged full retail price instead of discounted
- **Fix:** Changed to use `subtotal` and `total` fields (WooCommerce's correct fields for custom pricing)
- **Code:**
  ```typescript
  subtotal: (item.finalPrice * item.quantity).toString(),
  total: (item.finalPrice * item.quantity).toString()
  ```

**3. Cash Payment Display Fix** ✅
- **File:** `app/payment/page.tsx:116`
- **Issue:** CashPayment component received `order.total` (WooCommerce calculated) instead of discounted price
- **Fix:** Pass `finalTotal.toFixed(2)` from cart calculation

**4. POS Customer Assignment Fix** ✅
- **File:** `lib/posCustomer.ts`
- **Issue:** Shop manager accounts not found (search only looked for "customer" role)
- **Fix:** Added `role: 'all'` parameter to customer search
- **Impact:** Walk-in orders now correctly assigned to `pos-admin@coffee-oasis.com.my` (shop manager)

### Order Flow Improvements

**5. Ready for Pickup Status Flow** ✅
- **File:** `app/kitchen/page.tsx:94`
- **Change:** Pickup orders now use `"ready-for-pickup"` status (was staying in `"processing"`)
- **Flow:**
  - Pickup: Kitchen → `ready-for-pickup` → Customer picks up → `completed`
  - Delivery: Kitchen → `processing` + `out_for_delivery` → Delivered → `ready-for-pickup` → Customer picks up → `completed`

**6. Post-Payment Redirect** ✅
- **File:** `app/payment/page.tsx:83`
- **Change:** Redirects to `/admin/pos` instead of `/orders` after payment
- **Reason:** Admin workflow, not customer-facing

### Performance & Code Quality

**7. Excessive Debug Logging Cleanup** ✅
- **Files:**
  - `app/api/kitchen/orders/route.ts` (removed per-order metadata logging)
  - `app/api/delivery/orders/route.ts` (removed debug logs)
  - `app/api/update-order/[orderId]/route.ts` (removed 10+ logs per update)
  - `app/checkout/page.tsx` (removed cart logging)
- **Impact:** Removed 50+ console.log statements from hot paths (10-second polling routes)
- **Result:** Cleaner logs, better performance, less noise in production

**8. Product Cache Cleanup** ✅
- **File:** `app/api/products/route.ts`
- **Feature:** Now removes cached products that no longer exist in WooCommerce
- **Logic:** Compares WooCommerce product IDs with cached IDs, deletes stale entries
- **Use case:** Handles trashed/deleted products from WooCommerce

### UI Enhancements

**9. Kitchen Display Enhancement** ✅
- **File:** `app/kitchen/page.tsx`
- **Added:**
  - Item cards with visual separation
  - Item customizations/metadata display (add-ons, special requests)
  - SKU for inventory reference
  - Item prices
  - Special instructions highlighted in yellow
  - Order total
  - Larger quantity badges

**10. Product List UI Improvements** ✅
- **File:** `app/products/page.tsx`
- **Added:**
  - Horizontal scrollable category filter (pill buttons)
  - Products sorted by category, then by name
  - "All Items" default selection
  - Cleaner mobile-friendly layout

### Important Notes

**Customer-Facing Pages (Retained for Future):**
- `/app/orders/page.tsx` - Customer order history (not currently used)
- `/app/checkout/page.tsx` - Customer checkout flow (admin uses `/admin/pos`)
- `/app/products/page.tsx` - Customer product browsing
- **Status:** Code retained for future customer-facing features, but current workflow uses admin POS

**Order Metadata Keys (Standardized):**
- `kitchen_ready` (without underscore) - Marks order ready for pickup/delivery
- `out_for_delivery` (without underscore) - Marks order ready for delivery
- `_discount_reason`, `_retail_price`, `_discount_amount` - Discount tracking
- `startTime`, `endTime` - Kitchen timer (2 minutes per item)
- `_ready_timestamp` - Timestamp for ready-for-pickup status

### COGS & Bundle Product Fixes

**11. Bundle Selection Metadata for Orders** ✅
- **File:** `app/payment/page.tsx:34-67`
- **Issue:** Bundle products (e.g., Iced Latte) showed incorrect COGS in daily sales (combined Hot+Iced instead of selected variant)
- **Root Cause:** Bundle selection data wasn't being saved to order metadata, so consumption records couldn't filter by XOR groups
- **Fix:** Added bundle metadata to order line items:
  ```typescript
  if (item.bundle) {
    meta_data.push(
      { key: "_is_bundle", value: "true" },
      { key: "_bundle_display_name", value: item.name },
      { key: "_bundle_base_product_name", value: item.bundle.baseProductName },
      { key: "_bundle_mandatory", value: JSON.stringify(item.bundle.selectedMandatory) },
      { key: "_bundle_optional", value: JSON.stringify(item.bundle.selectedOptional) }
    );
  }
  ```
- **Impact:** COGS now correctly shows only selected variant materials (Iced Latte = Iced packaging only, not Hot+Iced combined)

**12. React Key Warning for Bundle Variants** ✅
- **File:** `app/admin/pos/page.tsx:275`
- **Issue:** Console warning about duplicate keys when Hot and Iced Latte both in cart (share productId 336)
- **Fix:** Changed cart item key from `item.productId` to `index`
- **Impact:** Each cart item has unique key, prevents React rendering issues

**13. Debug Logging Cleanup (COGS)** ✅
- **File:** `lib/db/inventoryConsumptionService.ts`
- **Removed:** Debug console.log statements from `calculateProductCOGS()` function
- **Impact:** Cleaner console output during COGS calculations

**14. XOR Filtering Verification** ✅
- **Files:**
  - `lib/db/inventoryConsumptionService.ts:158-171` (recordProductSale)
  - `lib/db/inventoryConsumptionService.ts:492-503` (calculateProductCOGS)
- **Verified:** Both functions correctly filter recipe items by selection groups
- **Logic:** Only includes materials from selected bundle variant (e.g., Hot XOR Iced)
- **Impact:** Inventory consumption and COGS calculations only include selected variant materials

### Files Modified in This Session

1. `app/api/orders/[orderId]/route.ts` - Fixed missing import
2. `app/api/update-order/[orderId]/route.ts` - Removed debug logging
3. `app/api/kitchen/orders/route.ts` - Removed debug logging, fixed metadata comment
4. `app/api/delivery/orders/route.ts` - Removed debug logging, fixed comment
5. `app/api/products/route.ts` - Added cache cleanup logic
6. `app/kitchen/page.tsx` - Enhanced display with prep details
7. `app/delivery/page.tsx` - Fixed delivered status to ready-for-pickup
8. `app/products/page.tsx` - Added horizontal category filter, sorting
9. `app/payment/page.tsx` - Fixed discount capture, cash display, redirect, **bundle metadata**
10. `app/checkout/page.tsx` - Removed debug logging
11. `lib/orderService.ts` - Updated WooLineItem type for subtotal/total
12. `lib/posCustomer.ts` - Fixed customer search to include all roles
13. `app/admin/pos/page.tsx` - Fixed React key warning for bundle variants
14. `lib/db/inventoryConsumptionService.ts` - Removed debug logging from COGS calculation

---

## Recent Changes (Session 011CV322pbHjdvxk3YcqjKk6)

### Thermal Printer Receipt Enhancements

**1. Icon/Emoji Stripping for Thermal Printers** ✅
- **File:** `lib/printerService.ts:74-85`
- **Issue:** Emojis and unicode characters caused garbled output on thermal printers
- **Fix:** Added `stripIcons()` function to remove all non-ASCII characters
- **Applied to:** Product names, bundle component names, discount reasons
- **Why:** Thermal printers only support basic ASCII characters
- **Code:**
  ```typescript
  private stripIcons(text: string): string {
    return text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emojis
      .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Miscellaneous symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
      // ... more unicode ranges
      .trim();
  }
  ```

**2. Bundle Component Display Fix** ✅
- **File:** `lib/printerService.ts:148, 212`
- **Issue:** Bundle components showed as "+ undefined" on receipts
- **Root Cause:** Accessing `component.name` when property is `component.productName`
- **Fix:** Changed to `component.productName || component.name || 'Unknown'`
- **Impact:** Combo products now show correct component names (e.g., "+ Dark Mane Americano")

**3. Price Alignment Enhancement** ✅
- **File:** `lib/printerService.ts:121-154`
- **Issue:** Long product names pushed prices off alignment on receipts
- **Fix:** Put prices on separate lines, fully right-aligned with padding
- **Logic:**
  - Print item name: `1x Wake-Up Wonder`
  - Next line, right-aligned: `RM 10.00` (original) or `RM 8.00` (discounted)
  - If discounted, show discount label indented: `  Student Discount    RM 8.00`
- **Code:**
  ```typescript
  await this.sendCommand(encoder.encode(`${item.quantity}x ${displayName}\n`));

  if (hasDiscount) {
    const originalPriceStr = `RM ${originalPrice.toFixed(2)}`;
    await this.sendCommand(encoder.encode(`${' '.repeat(32 - originalPriceStr.length)}${originalPriceStr}\n`));

    const discountLabel = `  ${this.stripIcons(discountReason || 'Discount')}`;
    const finalPriceStr = `RM ${finalPrice.toFixed(2)}`;
    const padding = Math.max(1, 32 - discountLabel.length - finalPriceStr.length);
    await this.sendCommand(encoder.encode(`${discountLabel}${' '.repeat(padding)}${finalPriceStr}\n`));
  } else {
    const itemPrice = `RM ${finalPrice.toFixed(2)}`;
    await this.sendCommand(encoder.encode(`${' '.repeat(32 - itemPrice.length)}${itemPrice}\n`));
  }
  ```

**4. Receipt Totals Reordering** ✅
- **File:** `lib/printerService.ts:162-211`
- **Change:** Reordered totals section for clarity
- **New order:**
  1. Total (original price before discounts)
  2. Discount (amount saved, shown as `-RM X.XX`)
  3. Subtotal (after discount)
  4. Tax (6% SST): Waived
  5. **TOTAL** (bold, final amount to pay)
- **Why:** Shows customers exactly how much they saved

**5. Digital Receipt QR Code** ✅
- **File:** `lib/printerService.ts:196-234`
- **Change:** Added QR code section with actual receipt URL
- **URL format:** `https://coffee-oasis.com.my/orders/{orderId}/receipt`
- **Features:**
  - ESC/POS QR code generation
  - Centered QR code with Model 2, Size 6, Error correction M
  - URL printed below QR code for manual access
  - Section header: "DIGITAL RECEIPT"
- **Why:** Customer-friendly receipt access without e-Invoice compliance (not yet required)

**6. Tax Display** ✅
- **File:** `lib/printerService.ts:187`
- **Added:** Tax line showing "Tax (6% SST): Waived"
- **Why:** Transparency for customers, prepared for future when SST applies

### Payment Confirmation Flow Simplification

**7. Auto-Generate PDF Receipt** ✅
- **File:** `components/CashPayment.tsx:76-81`
- **Change:** Automatically opens PDF receipt in new tab after payment confirmed
- **Removed:** "View & Print Receipt" modal/button (redundant)
- **Code:**
  ```typescript
  setPaymentConfirmed(true);
  window.open(`/orders/${orderID}/receipt`, '_blank');
  ```

**8. Optional Thermal Printing** ✅
- **File:** `components/CashPayment.tsx:172-201`
- **Change:** Thermal printer buttons marked as optional
- **UI:** Green checkmark, "PDF receipt generated" message, optional BT print buttons
- **Flow:** Confirm payment → PDF opens → Optional thermal print → Continue to next order

### Stock Display Implementation

**9. Database Schema: manageStock Column** ✅
- **File:** `lib/db/init.ts:168-181`
- **Migration:** Added `manageStock INTEGER NOT NULL DEFAULT 0` column to Product table
- **Purpose:** Store whether WooCommerce is tracking inventory for each product
- **Why:** Not all products have inventory tracking enabled (e.g., services, digital items)

**10. Product Service: Stock Tracking** ✅
- **File:** `lib/db/productService.ts:17, 97, 110, 133, 182`
- **Changes:**
  - Added `manageStock: boolean` to Product interface
  - Store `manage_stock` value from WooCommerce during sync
  - Only populate `stockQuantity` if `manage_stock` is true
- **Logic:** `stockQuantity: wcProduct.manage_stock ? (wcProduct.stock_quantity ?? 0) : 0`

**11. Products API: Return Actual manageStock** ✅
- **File:** `app/api/products/route.ts`
- **Fix:** Changed from hardcoded `manage_stock: false` to actual `product.manageStock`
- **Impact:** Products page now receives correct inventory tracking status

**12. Products Page: Stock Display** ✅
- **File:** `app/products/page.tsx`
- **Added:** Stock level display with color coding
  - Green: Stock ≥ 10
  - Yellow: Stock < 10
  - Red: Stock = 0
- **Conditional:** Only shows if `product.manage_stock && product.stock_quantity !== null && product.stock_quantity !== undefined`

**13. Recipes Page: Stock Display** ✅
- **File:** `app/admin/recipes/page.tsx:441-452`
- **Added:** Same stock display as products page
- **Fix:** Added undefined check to prevent TypeScript build error
- **Conditional:** `product.manageStock && product.stockQuantity !== null && product.stockQuantity !== undefined`

### Environment & Architecture

**14. WooCommerce API Environment Variables** ✅
- **File:** `lib/wooApi.ts:8-10`
- **Fix:** Proper fallback chain for environment variables
- **Order:** `NEXT_PUBLIC_WC_API_URL` → `WC_API_URL` → `WC_STORE_URL`
- **Why:** Different env vars for client-side vs server-side API calls

**15. Production Architecture Documentation** ✅
- **Setup:** POS runs locally on `localhost:3000`, connects to cloud WooCommerce
- **Receipt URLs:** Always use production domain for QR codes (even in dev mode)
- **Reason:** Customers need to access receipts from any device, not just local network

### Build Fixes

**16. TypeScript: Undefined Check** ✅
- **File:** `app/admin/recipes/page.tsx:441`
- **Error:** `'product.stockQuantity' is possibly 'undefined'`
- **Fix:** Added `product.stockQuantity !== undefined` to conditional
- **Impact:** Production build now succeeds without type errors

---

## Recent Changes (Session 011CV4vsw1uumcSjLujxNLHj)

### Stock Management with WooCommerce Sync

**1. Manual Stock Updates** ✅
- **File:** `app/admin/recipes/page.tsx:581-620`
- **Feature:** Editable stock quantity field with +/- buttons
- **API Endpoint:** `/api/products/update-stock` (POST)
- **Behavior:**
  - Updates local SQLite database
  - Syncs to WooCommerce if product has `wcId` and `manageStock` enabled
  - Real-time UI updates (no page reload needed)
  - Color-coded display: red (0), yellow (<10), green (≥10)
- **Code:**
  ```typescript
  async function updateStockQuantity(newStock: number) {
    const response = await fetch('/api/products/update-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: selectedProduct.id,
        stockQuantity: newStock,
      }),
    });
  }
  ```

**2. Stock Display Source Fix** ✅
- **File:** `app/api/admin/products/route.ts:43`
- **Issue:** Stock quantity showed stale values after updates (was using WooCommerce API response)
- **Fix:** Use local DB as source of truth for display
- **Before:** `stockQuantity: wcProduct?.stock_quantity ?? null`
- **After:** `stockQuantity: product.stockQuantity ?? null`
- **Why:** WooCommerce responses can be cached/delayed, local DB is always current

### Purchase Order System

**3. Complete PO Management** ✅
- **Service:** `lib/db/purchaseOrderService.ts`
- **Features:**
  - Create, read, update, delete purchase orders
  - Auto-generated PO numbers: `PO-YYYY-MM-NNNN`
  - Status workflow: draft → ordered → received
  - CSV export for supplier communication
  - Automatic inventory updates when receiving PO
  - WooCommerce stock sync via `addWooProductStock()`
- **Database:** SQLite tables for PurchaseOrder and PurchaseOrderItem
- **API Routes:**
  - `GET/POST /api/purchase-orders` - List and create
  - `GET/PATCH/DELETE /api/purchase-orders/[id]` - Single PO operations
  - `GET /api/purchase-orders/[id]/csv` - Export to CSV
  - `POST /api/purchase-orders/[id]/receive` - Mark received, update inventory

**4. WooCommerce Inventory Sync for POs** ✅
- **File:** `lib/db/purchaseOrderService.ts:355-386`
- **Function:** `addWooProductStock(wcProductId, quantity, productName)`
- **Behavior:**
  - Fetches current stock from WooCommerce
  - Checks if `manage_stock` is enabled
  - Calculates new stock: `current + quantity`
  - Updates via WooCommerce API
  - Logs inventory changes
- **Called When:** Purchase order marked as "received"
- **Pattern:** Mirrors `deductWooProductStock()` from inventory consumption service

**5. Purchase Order UI Enhancements** ✅
- **Admin Dashboard Button** (`/app/admin/page.tsx:281-289`)
  - Added "Purchase Orders" card with Truck icon
  - Quick access to create new POs
- **Create PO Form Defaults** (`/app/admin/purchase-orders/create/page.tsx`)
  - Order date: Today (`new Date().toISOString().split('T')[0]`)
  - Notes: "Deliver by 2PM"
  - Item notes: "1 ctn of 1" (auto-updates when quantity changes)
  - Example: Quantity 24 → Item notes: "1 ctn of 24"
- **PO List Actions** (`/app/admin/purchase-orders/page.tsx`)
  - "Mark as Ordered" button for draft POs
  - CSV export for all POs
  - Edit/Delete for draft POs only
  - "Mark Received" for ordered POs (triggers inventory update)

### Code Quality & Type Safety

**6. priceAdjustment Property Removal** ✅
- **File:** `lib/db/recipeService.ts`
- **Change:** Removed unused `priceAdjustment` from `ProductRecipeItem` interface
- **Reason:** Was an overengineered solution (commit 651c8a1), replaced with direct `basePrice` usage
- **Cleaned Up:**
  - Interface definition (line 9-28)
  - `addRecipeItem()` parameter
  - SQL INSERT statement (removed from column list)
  - `getRecipeItem()` and `getProductRecipe()` return statements
- **Database:** Column still exists with DEFAULT 0, but no longer used by application

**7. Database File Tracking Fix** ✅
- **File:** `prisma/dev.db`
- **Issue:** Was tracked in git despite being in `.gitignore`
- **Fix:** Removed from tracking with `git rm --cached prisma/dev.db`
- **Impact:** Database changes no longer appear in git status

**8. Build Error Fixes** ✅
- **File:** `/app/api/purchase-orders/route.ts`
- **Issue:** Next.js build error - exported non-HTTP method functions
- **Fix:** Removed helper functions (they exist in separate route files)
- **Valid Exports:** Only GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS

### Files Modified in This Session

1. `lib/db/recipeService.ts` - Removed priceAdjustment property
2. `lib/db/purchaseOrderService.ts` - Added WooCommerce sync for receiving POs
3. `app/api/products/update-stock/route.ts` - Created stock update endpoint
4. `app/api/admin/products/route.ts` - Fixed stock source (local DB)
5. `app/admin/recipes/page.tsx` - Added editable stock field with sync
6. `app/admin/page.tsx` - Added Purchase Orders button
7. `app/admin/purchase-orders/create/page.tsx` - Added defaults and auto-fill
8. `app/admin/purchase-orders/page.tsx` - Added "Mark as Ordered" button
9. `app/api/purchase-orders/route.ts` - Fixed build error (removed helper exports)

---

**Last Updated:** Session 011CV4vsw1uumcSjLujxNLHj (Stock management + Purchase orders + priceAdjustment cleanup)
**For questions:** Ask the user - they know the business logic best!
