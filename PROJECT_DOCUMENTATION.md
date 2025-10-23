# Coffee Oasis POS System - Project Documentation

**Current Status:** ✅ Production Ready
**Last Updated:** October 23, 2025
**Version:** 2.0.0

---

## 🎉 Recent Updates (October 23, 2025)

### ✅ **CRITICAL BUGS FIXED**
- **Fixed cart item property mismatch** - Changed `item.id` → `item.productId` in cart and checkout pages
- **Fixed navigation** - Home page now correctly links to `/products` instead of non-existent `/menu`
- **Fixed devcontainer** - Removed deprecated pnpm feature, now uses npm for better compatibility

### ✨ **NEW FEATURES ADDED**
- **Mock WooCommerce API** - Development mode with sample data for offline testing
- **Enhanced logging** - Clear API mode indicators (MOCK vs LIVE)
- **Environment switching** - Toggle between mock and real API via `USE_MOCK_API` flag

### 🧹 **MAJOR CLEANUP**
- **Removed 38 outdated files** - Including duplicate app structure, backup files, old savepoints
- **Cleaned context/ directory** - Now only contains `cartContext.tsx` (correct structure)
- **Added .gitignore** - Proper Next.js ignore patterns for node_modules, .next, etc.

### ✅ **VERIFIED WORKING**
- **WooCommerce API** - Confirmed working from GitHub Codespaces
- **Real orders** - Successfully creating orders in production WordPress
- **All features** - Cart, checkout, order tracking fully operational

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Current Status](#current-status)
3. [Technology Stack](#technology-stack)
4. [Architecture](#architecture)
5. [Key Features](#key-features)
6. [File Structure](#file-structure)
7. [User Flow](#user-flow)
8. [API Routes](#api-routes)
9. [Order Status Workflow](#order-status-workflow)
10. [Authentication System](#authentication-system)
11. [Timer System](#timer-system)
12. [State Management](#state-management)
13. [Environment Configuration](#environment-configuration)
14. [Mock API for Development](#mock-api-for-development)
15. [Setup Instructions](#setup-instructions)
16. [Future Enhancements](#future-enhancements)

---

## Project Overview

**Coffee Oasis** is a Point of Sale (POS) system for a coffee shop built with Next.js and integrated with WooCommerce for product and order management. The system supports both registered users and guest checkouts, with real-time order tracking, progress visualization, and QR code-based pickup.

**Live Store**: https://coffee-oasis.com.my

---

## Current Status

### ✅ What's Working
- ✅ **Authentication** - Passwordless login with email/phone
- ✅ **Product Catalog** - Fetching from WooCommerce
- ✅ **Shopping Cart** - Add, remove, quantity management
- ✅ **Checkout** - Order creation with timer metadata
- ✅ **Order Tracking** - Real-time progress with polling
- ✅ **Mock API** - Development mode for offline testing
- ✅ **GitHub Codespaces** - WooCommerce API accessible
- ✅ **Clean Codebase** - No duplicate files or outdated code

### ⚠️ Known Limitations
- Payment simulation only (no real payment gateway yet)
- Polling-based updates (WebSockets not implemented)
- Manual locker assignment (no automation yet)

### 🎯 Ready For
- ✅ Local development
- ✅ GitHub Codespaces development
- ✅ Staging deployment
- ⚠️ Production (needs real payment integration)

---

## Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **UI Library**: React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **QR Codes**: react-qr-code
- **Progress Indicators**: react-circular-progressbar

### Backend
- **E-commerce Platform**: WooCommerce
- **API**: WooCommerce REST API v3
- **API Client**: @woocommerce/woocommerce-rest-api
- **HTTP Client**: Axios

### State Management
- React Context API (Cart management)
- LocalStorage (User sessions, guest IDs, timer data)
- HTTP-only Cookies (Server-side session management)

---

## Architecture

### Application Structure
```
Next.js App Router (Server Components + Client Components)
    ↓
React Context (Cart State)
    ↓
API Routes (Next.js API handlers)
    ↓
WooCommerce REST API (External service)
```

### Data Flow
1. **User Actions** → Client Components
2. **State Updates** → React Context / LocalStorage
3. **API Calls** → Next.js API Routes
4. **WooCommerce** → Product/Order Management
5. **Real-time Updates** → Polling (10-second intervals)

---

## Key Features

### 1. Passwordless Authentication
- Email or phone-based login
- Auto-creates WooCommerce customer accounts
- 30-day persistent sessions via HTTP-only cookies
- Support for guest checkout without registration

### 2. Product Catalog
- Fetches products from WooCommerce
- Grid display with images and prices
- One-click add to cart
- Prices in Malaysian Ringgit (RM)

### 3. Shopping Cart
- Real-time cart updates
- Quantity management
- Item removal
- Persistent across navigation
- Visual cart badge in header

### 4. Order Management
- **Multi-stage workflow**: pending → processing → ready-for-pickup → completed
- Real-time order tracking with polling
- Kitchen timer system (2 minutes per item)
- Progress bar visualization
- QR code generation for pickup verification
- Locker number assignment

### 5. Order History
- View all past orders
- Filter by status
- Search by order ID or product name
- Separate views for guest and logged-in users

### 6. Mock API for Development (NEW!)
- **Environment-based switching** - Toggle between mock and real API
- **Sample data** - Pre-configured products (Latte, Cappuccino, Americano, Mocha)
- **Offline development** - Work without WooCommerce connection
- **Full feature support** - Products, orders, customers all mocked
- **Easy toggle** - Set `USE_MOCK_API=true` in `.env.local`

---

## File Structure

### Core Application Files
```
/app
  /page.tsx                          # Home page
  /layout.tsx                        # Root layout with CartProvider
  /login/page.tsx                    # Passwordless login
  /products/page.tsx                 # Product catalog
  /cart/page.tsx                     # Shopping cart
  /checkout/page.tsx                 # Checkout flow
  /orders/page.tsx                   # Order history list
  /orders/[orderId]/page.tsx         # Order detail with tracking

  /api
    /login/route.ts                  # Authentication endpoint
    /products/route.ts               # Product fetching
    /create-order/route.ts           # Order creation
    /orders/route.ts                 # List user/guest orders
    /orders/[orderId]/route.ts       # Get single order
    /orders/processing/route.ts      # Check for processing orders
    /update-order/[orderId]/route.ts # Update order status
```

### Shared Libraries
```
/lib
  /wooClient.ts                      # WooCommerce API client (with mock support)
  /mockWooClient.ts                  # Mock API for development
  /orderService.ts                   # Order CRUD operations
  /getGuestId.ts                     # Guest ID management
  /customerService.ts                # Customer operations
```

### State Management
```
/context
  /cartContext.tsx                   # Cart state provider & hooks
```

### Components
```
/components
  /HeaderNav.tsx                     # Navigation with cart badge
  /cart/CartItem.tsx                 # Cart item component
```

### Configuration
```
/.env.local                          # Environment variables
/next.config.js                      # Next.js configuration
/tailwind.config.ts                  # Tailwind CSS settings
/tsconfig.json                       # TypeScript configuration
```

---

## User Flow

### Complete Customer Journey

1. **Landing** (`/`)
   - View login status
   - Access menu/products
   - View orders if logged in

2. **Login** (`/login`)
   - Enter email or phone
   - System creates or finds WooCommerce customer
   - Sets userId cookie (30 days)
   - Redirects to orders page

3. **Browse Products** (`/products`)
   - View product grid with images
   - Click product to add to cart
   - See cart badge update

4. **Review Cart** (`/cart`)
   - View all items
   - Adjust quantities
   - Remove items
   - See total price
   - Proceed to checkout

5. **Checkout** (`/checkout`)
   - Review order summary
   - Confirm and pay
   - Creates order with timer metadata
   - Redirects to order detail page

6. **Track Order** (`/orders/[orderId]`)
   - **Pending**: Shows "Simulate Payment" button
   - **Processing**: Live progress bar (2 min/item)
   - **Ready**: Locker number + pickup code + QR code
   - **Completed**: Final order details

7. **Order History** (`/orders`)
   - List all orders
   - Filter by status
   - Search orders
   - Click to view details

---

## API Routes

| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/api/login` | POST | Passwordless auth, creates/finds customer | None |
| `/api/products` | GET | Fetch WooCommerce products | None |
| `/api/create-order` | POST | Create new order with timer | Cookie or guestId |
| `/api/orders` | GET | List user/guest orders | Cookie or guestId |
| `/api/orders/[orderId]` | GET | Get single order details | None |
| `/api/orders/processing` | GET | Check for processing orders | Cookie or guestId |
| `/api/update-order/[orderId]` | PATCH | Update order status | None |

### Request/Response Examples

#### Login
**Request:**
```json
POST /api/login
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "userId": 123,
  "email": "user@example.com",
  "created": false
}
```

#### Create Order
**Request:**
```json
POST /api/create-order
{
  "line_items": [
    { "product_id": 45, "quantity": 2 },
    { "product_id": 67, "quantity": 1 }
  ],
  "userId": 123,  // or "guestId": "uuid-string"
  "meta_data": []
}
```

**Response:**
```json
{
  "id": 789,
  "status": "pending",
  "line_items": [...],
  "meta_data": [
    { "key": "startTime", "value": "1698123456789" },
    { "key": "endTime", "value": "1698123816789" }
  ],
  "total": "45.50"
}
```

---

## Order Status Workflow

```
┌─────────┐    Payment    ┌────────────┐    Kitchen    ┌─────────────────┐    Pickup    ┌───────────┐
│ pending │─────────────→│ processing │──────────────→│ ready-for-pickup│─────────────→│ completed │
└─────────┘               └────────────┘               └─────────────────┘              └───────────┘
                               │                              │
                               │ Timer starts                 │ Locker assigned
                               │ (2 min/item)                 │ QR code generated
```

### Status Descriptions

| Status | Description | UI Display |
|--------|-------------|------------|
| `pending` | Order created, awaiting payment | "Simulate Payment" button |
| `processing` | Payment confirmed, kitchen preparing | Progress bar with timer |
| `ready-for-pickup` | Order ready in locker | Locker number + QR code |
| `completed` | Customer picked up order | Order summary only |

---

## Authentication System

### Passwordless Flow

1. User enters email or phone
2. System normalizes input:
   - Email: lowercased
   - Phone: converted to `{number}@guest.local`
3. WooCommerce lookup by email
4. If not found, create new customer with random UUID password
5. Set HTTP-only cookie with `userId`
6. Mirror `userId` to localStorage for client-side checks

### Guest vs. Registered

| Feature | Guest | Registered |
|---------|-------|------------|
| Identifier | `guestId` (UUID in localStorage) | `userId` (WooCommerce customer ID) |
| Storage | localStorage + order meta_data | HTTP-only cookie + WooCommerce |
| Order Retrieval | meta_key filter | customer_id filter |
| Persistence | Browser-specific | Cross-device (via email) |

---

## Timer System

### Implementation

**Server-Side (Order Creation):**
```typescript
const now = Date.now();
const duration = 2 * 60_000 * line_items.length; // 2 min per item
const startTime = String(now);
const endTime = String(now + duration);

meta_data: [
  { key: 'startTime', value: startTime },
  { key: 'endTime', value: endTime }
]
```

**Client-Side (Progress Calculation):**
```typescript
const start = Number(getMeta('startTime'));
const end = Number(getMeta('endTime'));
const now = Date.now();
const progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
```

**Update Interval:**
- Progress bar updates every 1 second
- Order status polls every 10 seconds

---

## State Management

### Cart Context

**Location:** `context/cartContext.tsx`

**State:**
```typescript
interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}
```

**Methods:**
- `addToCart(item)` - Adds item or increments quantity
- `removeFromCart(productId)` - Removes item from cart
- `clearCart()` - Empties cart (after checkout)

### LocalStorage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `userId` | number | WooCommerce customer ID (mirrors cookie) |
| `guestId` | UUID | Anonymous user identifier |
| `currentWooId` | number | Active order ID for header badge |
| `startTime` | timestamp | Order timer start (mirrored from meta) |
| `endTime` | timestamp | Order timer end (mirrored from meta) |

---

## Environment Configuration

### Required Variables

```env
# Mock API Toggle (NEW!)
USE_MOCK_API=true                    # Set to 'false' for production

# WooCommerce Store URL
WC_STORE_URL=https://coffee-oasis.com.my
NEXT_PUBLIC_WC_STORE_URL=https://coffee-oasis.com.my

# WooCommerce API Credentials
WC_CONSUMER_KEY=ck_4c68d57aa31e3939fec6fdb3cf7951898b709e79
WC_CONSUMER_SECRET=cs_d914594329aa922603eea43a1568fd375bc99afd
```

### Environment Modes

**Development (Mock API):**
```env
USE_MOCK_API=true
```
- Uses sample data (no real WooCommerce connection)
- Fast responses, works offline
- Perfect for frontend development

**Production (Real API):**
```env
USE_MOCK_API=false
```
- Connects to real WooCommerce
- Creates real orders and customers
- Requires API credentials

### Security Notes
- Consumer key/secret are server-side only
- Never expose in client-side code
- Use `NEXT_PUBLIC_` prefix only for non-sensitive values
- Rotate keys if compromised
- Mock API should only be used in development

---

## Mock API for Development

### Overview
The mock API allows development without connecting to the real WooCommerce API. Perfect for:
- Frontend development
- Testing without affecting production data
- Working offline or when API is blocked
- Faster iteration during development

### Configuration

**Enable Mock API:**
```bash
# In .env.local
USE_MOCK_API=true
```

**Disable Mock API (use real WooCommerce):**
```bash
# In .env.local
USE_MOCK_API=false
```

### Mock Data Included

**Products (4 items):**
- Latte - RM 12.50
- Cappuccino - RM 11.00
- Americano - RM 9.50
- Mocha - RM 13.00

**Features:**
- Customer creation/lookup
- Order creation with status transitions
- Timer metadata for order tracking
- All CRUD operations supported

### Implementation

**File:** `lib/mockWooClient.ts`

The mock API implements the same interface as the real WooCommerce client:
```typescript
{
  get(endpoint, params)
  post(endpoint, payload)
  put(endpoint, payload)
}
```

**Logging:**
When mock API is active, you'll see:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 WooCommerce API Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: MOCK
USE_MOCK_API env: true
Store URL: https://coffee-oasis.com.my
Using: Mock responses (no real orders)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Limitations
- Mock orders are not saved to WordPress
- No real payment processing
- Limited product catalog (4 items)
- No real customer accounts created

---

## Setup Instructions

### Prerequisites
- Node.js 18+
- npm (comes with Node.js)
- WooCommerce store with REST API enabled (only for production mode)

### Option 1: Local Development

1. **Clone repository:**
```bash
git clone https://github.com/kayuwoody/ren1.git
cd ren1
```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment:**
```bash
# Copy the existing .env.local or create one
# For development with mock data:
echo "USE_MOCK_API=true" > .env.local

# Add WooCommerce credentials (even if using mock):
echo "WC_STORE_URL=https://coffee-oasis.com.my" >> .env.local
echo "WC_CONSUMER_KEY=ck_4c68d57aa31e3939fec6fdb3cf7951898b709e79" >> .env.local
echo "WC_CONSUMER_SECRET=cs_d914594329aa922603eea43a1568fd375bc99afd" >> .env.local
```

4. **Run development server:**
```bash
npm run dev
```

5. **Open browser:**
```
http://localhost:3000
```

You should see the API mode banner in your terminal:
```
🔧 WooCommerce API Configuration
Mode: MOCK (or LIVE)
```

### Option 2: GitHub Codespaces (Recommended)

1. **Open in Codespaces:**
   - Go to https://github.com/kayuwoody/ren1
   - Click green "Code" button
   - Select "Codespaces" tab
   - Click "Create codespace on [branch]"

2. **Wait for setup:**
   - Devcontainer will automatically install dependencies
   - Takes ~2-3 minutes on first launch

3. **Configure environment:**
   - The `.env.local` file already exists
   - Set `USE_MOCK_API=true` for mock mode
   - Set `USE_MOCK_API=false` for real API

4. **Start dev server:**
```bash
npm run dev
```

5. **Access the app:**
   - Codespaces will show a "Open in Browser" popup
   - Or use the Ports tab to open port 3000

**Note:** The real WooCommerce API works from GitHub Codespaces!

### WooCommerce Setup (Production Mode Only)

1. Install WooCommerce plugin on WordPress
2. Go to WooCommerce > Settings > Advanced > REST API
3. Create API key with Read/Write permissions
4. Copy Consumer Key and Consumer Secret to `.env.local`
5. Set `USE_MOCK_API=false`
6. Ensure CORS is enabled for your domain
7. Whitelist Codespaces IP range if using Cloudflare/WAF

---

## Future Enhancements

### High Priority
1. **Real Payment Integration** - Stripe, PayPal, or local gateway
2. **Push Notifications** - Notify when order ready
3. **Order Cancellation** - Allow users to cancel pending orders
4. **Better Error Handling** - User-friendly error messages
5. **Mobile App** - React Native or PWA

### Medium Priority
6. **Admin Dashboard** - Kitchen display system
7. **Inventory Management** - Track stock levels
8. **Order Modifications** - Edit orders before processing
9. **Loyalty Program** - Points/rewards system
10. **Analytics** - Sales reports and insights

### Nice to Have
11. **Multi-language Support** - i18n for Malay, Chinese
12. **Dark Mode** - Theme toggle
13. **Order Scheduling** - Pre-order for pickup time
14. **Favorites** - Save frequently ordered items
15. **Split Payment** - Multiple payment methods

---

## Technical Debt

1. Replace polling with WebSockets for real-time updates
2. Add comprehensive error boundaries
3. Implement retry logic for failed API calls
4. Add unit and integration tests
5. Optimize bundle size (code splitting)
6. Add loading skeletons for better UX
7. Implement proper TypeScript types (replace `any`)
8. Add API rate limiting
9. Implement proper logging system
10. Add accessibility (ARIA labels, keyboard navigation)

---

## Changelog

### Version 2.0.0 (October 23, 2025)

**🐛 Bug Fixes:**
- Fixed cart item property mismatch (item.id → item.productId)
- Fixed home page navigation (/menu → /products)
- Fixed devcontainer pnpm feature error

**✨ New Features:**
- Added mock WooCommerce API for development
- Added environment-based API switching (USE_MOCK_API)
- Added enhanced API mode logging with visual banners
- Added comprehensive .gitignore for Next.js

**🧹 Cleanup:**
- Removed 38 outdated/duplicate files
- Cleaned duplicate app structure from context/ directory
- Removed old savepoint archives and backup files
- Removed outdated refactor documentation

**✅ Verified:**
- WooCommerce API works from GitHub Codespaces
- Real orders successfully creating in production
- All cart and checkout features operational

### Version 1.0.0 (July 3, 2025)
- Initial implementation
- Basic POS features
- WooCommerce integration

---

## Contact & Support

**Repository:** https://github.com/kayuwoody/ren1
**Store:** https://coffee-oasis.com.my
**Framework Docs:** https://nextjs.org/docs
**WooCommerce API:** https://woocommerce.github.io/woocommerce-rest-api-docs/

---

**Last Updated:** October 23, 2025
**Version:** 2.0.0
**Status:** ✅ Production Ready (needs payment integration)
**Author:** Coffee Oasis Team
