# Architecture Guide for AI Assistants

This document helps you understand the codebase patterns and utilities. Read this first before making changes.

## Helper Utilities (DO NOT RECREATE - USE THESE!)

### 1. Error Handling (`lib/api/error-handler.ts`)
**Always use this for API routes.** Do not write manual try-catch error responses.

```typescript
import { handleApiError, validationError, notFoundError, unauthorizedError } from '@/lib/api/error-handler';

// Validation errors (400)
if (!requiredField) {
  return validationError('Field is required', '/api/your-route');
}

// Not found errors (404)
if (!resource) {
  return notFoundError('Resource not found', '/api/your-route');
}

// Unauthorized errors (401)
if (!token || token !== expected) {
  return unauthorizedError('Unauthorized', '/api/your-route');
}

// Generic error handling in catch blocks
try {
  // ... your code
} catch (error) {
  return handleApiError(error, '/api/your-route');
}
```

**Status:** Applied to all 39 API routes. Never write manual error responses again.

### 2. WooCommerce Pagination (`lib/api/woocommerce-helpers.ts`)
**Always use this for WooCommerce API calls.** Do not write manual pagination loops.

```typescript
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';

// Fetches ALL pages automatically (no 100-item limit)
const allOrders = await fetchAllWooPages('orders', { status: 'processing' });
const allProducts = await fetchAllWooPages('products');
const allCustomers = await fetchAllWooPages('customers', { role: 'customer' }, 50); // custom per_page
```

**Before this utility:** Routes were capped at 100 items, had 180 lines of boilerplate
**After this utility:** ~30 lines, unlimited items
**Status:** Applied to 9 routes (all admin reporting and product sync routes)

### 3. Metadata Extraction (`lib/api/woocommerce-helpers.ts`)
**Always use this for WooCommerce metadata.** Do not use `.find()` manually.

```typescript
import { getMetaValue } from '@/lib/api/woocommerce-helpers';

// Safe metadata extraction with defaults
const bundleMandatory = getMetaValue(order.meta_data, '_bundle_mandatory', '{}');
const customField = getMetaValue(product.meta_data, '_custom_field', 'default_value');
```

**Before:** 40 lines of repetitive `.find()` chains
**After:** 8 lines, consistent null handling

## Key Patterns

### API Route Structure
```typescript
import { NextResponse } from 'next/server';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate early
    if (!body.required) {
      return validationError('required field missing', '/api/route');
    }

    // Business logic
    const result = await doSomething(body);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return handleApiError(error, '/api/route');
  }
}
```

### WooCommerce API Error Handling
WooCommerce errors nest in `response.data`. The `handleApiError` function already handles this:
- Extracts error from `response.data.message` or `response.data.data.message`
- Returns proper HTTP status codes
- Includes stack traces in development

### Database Access
- Direct SQL: `db.prepare('SELECT ...')` from `@/lib/db/init`
- Services: Use existing service layers in `lib/db/*Service.ts`
- Never commit `prisma/dev.db` files (already in .gitignore)

## Project Context

### Tech Stack
- Next.js 14 App Router
- TypeScript
- SQLite with better-sqlite3
- WooCommerce REST API integration
- API routes in `app/api/`

### Key Services
- `lib/orderService.ts` - WooCommerce order operations
- `lib/db/inventoryConsumptionService.ts` - COGS tracking
- `lib/db/recipeService.ts` - Product recipe/BOM management
- `lib/loyaltyService.ts` - Customer points system

### Important Patterns
- Orders store bundle metadata in `_bundle_mandatory` and `_bundle_optional` meta fields
- Inventory consumption records are created per order line item
- Products can have recipes (materials + linked products)
- All currency values in Malaysian Ringgit (RM)

## Phase 2 Optimization Status
✅ Task 1: Pagination utility (`fetchAllWooPages`) - COMPLETE
✅ Task 2: Metadata helpers (`getMetaValue`) - COMPLETE
✅ Task 3: Error handling standardization - COMPLETE (39/39 routes)
⏸️ Task 4: Logging utility - DEFERRED

## When Making Changes
1. **Check for existing utilities first** - grep for similar patterns
2. **Use helper functions** - don't recreate pagination, error handling, or metadata extraction
3. **Follow existing patterns** - look at similar routes for consistency
4. **Test incrementally** - user will test after each batch of changes
5. **Keep commits atomic** - one logical change per commit with clear messages

## Git Workflow
- Branch: Always use `claude/initial-setup-*` pattern
- Commits: Clear, descriptive messages with context
- Push: Only when explicitly requested
- Never use `--force` on main/master
