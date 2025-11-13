# AI Context - Quick Start

## Project
Coffee shop POS (Next.js 14, TypeScript, WooCommerce API, SQLite). Currency: RM (Malaysian Ringgit).

## Current Branch
`claude/fix-priceadjustment-011CV4vsw1uumcSjLujxNLHj`

## Recently Completed

### Stock Management & Inventory Updates (Session 011CV4vsw1uumcSjLujxNLHj)
- **Feature**: Manual stock quantity management with WooCommerce sync
- **API Endpoint**: `/api/products/update-stock` - POST endpoint for stock updates
- **UI Changes**:
  - Editable stock field with +/- buttons in `/admin/recipes` page
  - Direct numeric input (not just +/- buttons)
  - Color-coded stock display (red: 0, yellow: <10, green: ≥10)
  - Real-time updates to both local DB and WooCommerce
- **Source of Truth Fix**: Changed stock display to use local DB instead of WooCommerce API (fixes stale data on reload)
  - File: `app/api/admin/products/route.ts:43` - returns `product.stockQuantity` instead of `wcProduct?.stock_quantity`
- **Files**: `app/api/products/update-stock/route.ts`, `app/admin/recipes/page.tsx`, `app/api/admin/products/route.ts`

### Purchase Order System (Session 011CV4vsw1uumcSjLujxNLHj)
- **Feature**: Complete supplier purchase order management
- **Workflow**: Draft → Ordered → Received (updates inventory automatically)
- **Auto-generated PO Numbers**: Format `PO-YYYY-MM-NNNN` (e.g., PO-2025-11-0001)
- **CSV Export**: Download PO as CSV for supplier communication
- **WooCommerce Sync**: Receiving PO updates both local DB and WooCommerce stock levels
- **UI Enhancements**:
  - Purchase Orders button on admin dashboard (`/admin/page.tsx`)
  - Prefilled item notes: "1 ctn of " + quantity (auto-updates on quantity change)
  - Default order date: Today
  - Default notes: "Deliver by 2PM"
  - "Mark as Ordered" button for draft POs
- **Files**:
  - Service: `lib/db/purchaseOrderService.ts` (includes `addWooProductStock()` for inventory sync)
  - API: `/app/api/purchase-orders/**`
  - UI: `/app/admin/purchase-orders/**`
- **FTP Integration**: Receipt upload to Hostinger FTP server (restored from previous work)

### Code Cleanup & Type Safety (Session 011CV4vsw1uumcSjLujxNLHj)
- **priceAdjustment Removal**: Removed unused `priceAdjustment` property from `ProductRecipeItem` interface
  - Was an overengineered solution replaced in commit 651c8a1 (now uses `basePrice` directly)
  - Cleaned up interface, function parameters, SQL INSERT, and return statements
  - Database column still exists but is no longer used by application
  - File: `lib/db/recipeService.ts`
- **dev.db Tracking Fix**: Removed `prisma/dev.db` from git tracking (was tracked despite .gitignore)
- **Build Error Fixes**: Fixed Next.js route exports (removed non-HTTP method exports from `/api/purchase-orders/route.ts`)

## Recently Completed (Previous Sessions)

### Thermal Printer & Receipt Enhancements (Session 011CV322pbHjdvxk3YcqjKk6)
- **Feature**: Enhanced thermal printer receipts with professional formatting
- **Changes**:
  - Icon/emoji stripping for ASCII-only thermal printers (fixes garbled output)
  - Right-aligned prices on separate lines for better readability
  - Fixed bundle component display (was showing "+ undefined")
  - Clear total breakdown: Total → Discount → Subtotal → Tax (Waived) → TOTAL
  - Digital receipt QR code linking to actual receipt URL
  - Tax display: "Tax (6% SST): Waived"
- **Files**: `lib/printerService.ts`, `components/CashPayment.tsx`

### Payment Confirmation Flow Simplification (Session 011CV322pbHjdvxk3YcqjKk6)
- **Changes**: Streamlined post-payment experience
  - Auto-generates PDF receipt on payment confirmation (no modal)
  - Removed redundant "View & Print Receipt" button
  - Optional thermal printer buttons (receipt + kitchen)
  - Simplified UI focused on next order workflow
- **File**: `components/CashPayment.tsx`

### Stock Display Implementation (Session 011CV322pbHjdvxk3YcqjKk6)
- **Feature**: Display real-time WooCommerce stock levels
- **Database**: Added `manageStock` column to Product table
- **Display**: Shows stock on products page and recipes admin page
- **Logic**: Only displays if WooCommerce is tracking inventory (`manage_stock: true`)
- **Files**: `lib/db/init.ts`, `lib/db/productService.ts`, `app/api/products/route.ts`, `app/products/page.tsx`, `app/admin/recipes/page.tsx`

### Production Architecture Notes (Session 011CV322pbHjdvxk3YcqjKk6)
- **Setup**: POS runs locally (`localhost`), connects to cloud WooCommerce
- **Receipt URLs**: Always use production domain (`https://coffee-oasis.com.my/orders/{id}/receipt`)
- **Environment**: Fixed `wooApi.ts` to properly check `NEXT_PUBLIC_WC_API_URL` fallback chain

### Promo Image Generator (Session 011CUyHhvr99aAQihXBa6wU3)
- **Feature**: Automated promo image generation for combo products
- **Style**: Playful, cutesy kawaii aesthetic matching chibi unicorn mascot
- **Formats**: Menu board (1920×1080), Instagram (1080×1080), Locker display (1080×1920)
- **Tech**: Client-side Canvas API (no server dependencies), WooCommerce media library integration
- **Location**: `/admin/promo-generator`
- **Documentation**: See `.claude/PROMO_GENERATOR.md`

### Bundle Component Optimization (Session 011CUyHhvr99aAQihXBa6wU3)
- **Problem**: Bundle components fetched repeatedly (60+ API calls/min), regular products showing component breakdown incorrectly
- **Solution**: Fetch once at add-to-cart, store in cart/order metadata. Only combo products show breakdown.
- **Detection**: `product.categories.some(cat => cat.slug === 'combo')` → fetch components
- **Storage**: `item.components` array in cart, `_bundle_components` in order metadata
- **Result**: ~99% reduction in API calls

### SSE Push Updates (Replaces Polling)
- **Replaced polling**: Customer display (was 60 req/min) and kitchen display (was 6 req/min) now use SSE
- **Endpoints**: `/api/cart/stream` (cart), `/api/kitchen/stream` (orders)
- **Managers**: `lib/sse/cartStreamManager.ts`, `lib/sse/orderStreamManager.ts`
- **Broadcasts**: Cart updates → `broadcastCartUpdate()`, Order updates → `broadcastOrderUpdate()`
- **Result**: Zero polling, instant push updates across devices on network

### WooCommerce Inventory for Combo Components
- **Problem**: Danish/Americano inventory not decreasing when sold as part of Wake-Up Wonder combo
- **Solution**: Added `deductWooProductStock()` - updates WooCommerce inventory via API for all linked products
- **Function**: `recordProductSale()` is now **async** (important!)
- **Flow**: Combo sold → WooCommerce deducts combo → Our code deducts component products (Danish, Americano, etc.)
- **Location**: `lib/db/inventoryConsumptionService.ts:355-386`

### UI Improvements
- **Admin Dashboard**: Removed redundant POS button, added Daily Sales shortcut (green button, first in Analytics)
- **Daily Sales**: Orders expand by default instead of collapsed
- **Customer Display**: Connection status indicator (green=live, yellow=connecting, red=disconnected)

## Critical Rules (READ FIRST)

### 1. ALWAYS Use These Utilities
```typescript
// Error handling - ALL API routes
import { handleApiError, validationError, notFoundError } from '@/lib/api/error-handler';
if (!required) return validationError('msg', '/api/route');
try { } catch (error) { return handleApiError(error, '/api/route'); }

// WooCommerce pagination - fetches ALL pages
import { fetchAllWooPages, getMetaValue } from '@/lib/api/woocommerce-helpers';
const orders = await fetchAllWooPages('orders', { status: 'processing' });
const value = getMetaValue(order.meta_data, '_key', 'default');
```

### 2. NEVER Modify Without Approval
**File**: `.claude/CRITICAL_FUNCTIONS.md` - Lists money/inventory functions with recursion
- Inventory consumption: `recordProductSale()` - **ASYNC**, recursive, filters by bundle selection, updates WooCommerce
- COGS calculation: `calculateProductCOGS()` - recursive, filters by bundle selection
- Order line items: `app/payment/page.tsx:34-67` - discount + bundle metadata
- Check git history first: `git log --all -S "function_name" -- file_path`
- **IMPORTANT**: Always await `recordProductSale()` - it's async now!

### 3. Bundle Component Display Pattern
```typescript
// Read from stored data (NO API calls)
const components = item.components || [];
{components.length > 0 && (
  <div className="mt-1 ml-3">
    {components.map((c, i) => (
      <div key={i}>→ {c.productName} × {c.quantity}</div>
    ))}
  </div>
)}
```

### 4. Order Metadata Keys
- `_bundle_components` - JSON array of expanded components (stored at order creation)
- `_bundle_mandatory` / `_bundle_optional` - Bundle selections for COGS filtering
- `_is_bundle`, `_bundle_display_name` - Display metadata
- `_retail_price`, `_final_price`, `_discount_reason` - Discount tracking

## Key File Locations

```
lib/
  api/
    error-handler.ts         ← USE THIS for all error handling
    woocommerce-helpers.ts   ← USE THIS for pagination/metadata
  db/
    inventoryConsumptionService.ts  ← CRITICAL: Don't break recursion
    recipeService.ts                ← CRITICAL: updateProductTotalCost has recursion
    purchaseOrderService.ts         ← Purchase order CRUD, WooCommerce sync
  sse/
    cartStreamManager.ts     ← SSE manager for cart updates
    orderStreamManager.ts    ← SSE manager for order updates
  orderService.ts
  wooClient.ts
  promoImageGenerator.ts     ← Promo image generation (Canvas API)

app/api/
  cart/
    current/route.ts    ← Broadcasts cart updates via SSE
    stream/route.ts     ← SSE endpoint for customer display
  kitchen/stream/route.ts  ← SSE endpoint for kitchen display
  update-order/[orderId]/route.ts  ← Broadcasts order updates
  promo/upload/route.ts  ← Upload promo images to WooCommerce
  purchase-orders/
    route.ts           ← GET (list), POST (create)
    [id]/route.ts      ← GET, PATCH (update), DELETE
    [id]/csv/route.ts  ← CSV export
    [id]/receive/route.ts  ← POST (mark received, update inventory)
  products/
    update-stock/route.ts  ← POST (manual stock updates with WooCommerce sync)

app/
  customer-display/page.tsx  ← Listens to SSE (no polling)
  kitchen/page.tsx           ← Listens to SSE (no polling)
  products/page.tsx          ← Checks isCombo, fetches components once
  payment/page.tsx           ← Stores components in order metadata
  admin/
    promo-generator/page.tsx  ← Generate promo images for combos
    purchase-orders/
      page.tsx               ← List POs, mark as ordered, CSV export
      create/page.tsx        ← Create new PO (defaults: today, "Deliver by 2PM")
    recipes/page.tsx          ← Editable stock with +/- and WooCommerce sync

context/cartContext.tsx  ← CartItem.components field
components/ProductSelectionModal.tsx  ← isCombo prop, buildDisplayName()
```

## Common Patterns

### API Route Standard
```typescript
import { NextResponse } from 'next/server';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.required) return validationError('msg', '/api/route');

    const result = await doWork(body);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return handleApiError(error, '/api/route');
  }
}
```

### SSE Broadcast Pattern
```typescript
// When data changes, broadcast to all connected clients
import { broadcastCartUpdate } from '@/lib/sse/cartStreamManager';
import { broadcastOrderUpdate } from '@/lib/sse/orderStreamManager';

// Cart changed
currentCart = newCart;
broadcastCartUpdate(currentCart, false);

// Order status changed
await updateWooOrder(orderId, { status: 'processing' });
broadcastOrderUpdate();
```

### Working with WooCommerce
```typescript
// Fetches ALL pages (no 100-item limit)
const allOrders = await fetchAllWooPages('orders', { status: 'processing' });

// Extract metadata safely
const components = getMetaValue(item.meta_data, '_bundle_components');
const parsed = components ? JSON.parse(components) : [];
```

## Starting a New Task

1. Read `.claude/CONTEXT.md` (this file)
2. Check if function is in `.claude/CRITICAL_FUNCTIONS.md` → ask user before modifying
3. Search for existing utilities: `grep -r "pattern" lib/`
4. Check similar code: Read related files first
5. Use error-handler.ts and woocommerce-helpers.ts (mandatory)
6. Test incrementally, commit small batches

## Git Workflow
- Branch: Auto-generated `claude/*` names
- Never force push to main
- Never commit `.env.local` or `prisma/dev.db`
- Push only when user explicitly requests

## Testing Bundle Components
```bash
# Clear cache
rm -rf .next && npm run dev

# Browser console
localStorage.clear()
location.reload()

# Network tab: Filter for /api/bundles/expand
# Should see ONLY 1 call at add-to-cart (not on every page)
```

## If SSE Not Working
- Check browser console for "📺 Customer Display: Connected" or "🍳 Kitchen Display: Connected"
- Verify EventSource connection in Network tab (event-stream)
- Check server logs for "Total clients: X"
- SSE auto-reconnects on connection loss

---

**For detailed docs**: See `AI_ASSISTANT_GUIDE.md`, `BUNDLE_COMPONENT_OPTIMIZATION.md`, `CRITICAL_FUNCTIONS.md`
