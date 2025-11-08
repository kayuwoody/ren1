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
- `_bundle_mandatory` - JSON string of mandatory selections for bundle products
- `_bundle_optional` - JSON array of optional add-ons
- `startTime` / `endTime` - Timer for kitchen display (2 min per item)
- `_pickup_timestamp` / `_pickup_locker` - Locker pickup details
- `_guestId` - For guest checkout orders

**Extracting metadata:**
```typescript
const bundleMandatory = getMetaValue(order.meta_data, '_bundle_mandatory', '{}');
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

### Files Modified in This Session

1. `app/api/orders/[orderId]/route.ts` - Fixed missing import
2. `app/api/update-order/[orderId]/route.ts` - Removed debug logging
3. `app/api/kitchen/orders/route.ts` - Removed debug logging, fixed metadata comment
4. `app/api/delivery/orders/route.ts` - Removed debug logging, fixed comment
5. `app/api/products/route.ts` - Added cache cleanup logic
6. `app/kitchen/page.tsx` - Enhanced display with prep details
7. `app/delivery/page.tsx` - Fixed delivered status to ready-for-pickup
8. `app/products/page.tsx` - Added horizontal category filter, sorting
9. `app/payment/page.tsx` - Fixed discount capture, cash display, redirect
10. `app/checkout/page.tsx` - Removed debug logging
11. `lib/orderService.ts` - Updated WooLineItem type for subtotal/total
12. `lib/posCustomer.ts` - Fixed customer search to include all roles

---

**Last Updated:** Session 011CUuTiUmBCgpKEL4iJdCow (Major bug fixes + UI enhancements)
**For questions:** Ask the user - they know the business logic best!
