# Coffee Oasis POS System - Project Documentation

**Current Status:** ✅ Production Ready (Staff/Admin App)
**Last Updated:** November 9, 2025
**Version:** 3.0.0

---

## 🎉 Recent Updates (November 2025)

### ✨ **NEW MAJOR FEATURES**

#### Multi-Screen POS System
- **Network-enabled displays** - POS serves customer/kitchen displays over local network
- **Customer Display** - Clean, kiosk-mode display with real-time cart sync
- **Kitchen Display** - 3-4 column grid optimized for landscape tablets
- **Server-side cart sync** - All displays stay in sync across devices in real-time

#### Hold Order System
- **Multiple concurrent orders** - Hold orders while serving other customers
- **Auto-generated tags** - Format: YYMMDD_H### (e.g., 250811_H001)
- **Customer assignment** - Search and assign customers or use auto-tags
- **Auto-cleanup** - 4-hour threshold for old held orders
- **LocalStorage based** - Fast, lightweight, no database needed

#### COGS & Inventory Management
- **Recipe Builder** - Define product recipes with materials, packaging, and labor
- **COGS Calculation** - Automatic cost tracking per product
- **Bundle Products** - Support for products with mandatory/optional add-ons
- **XOR Groups** - Mutually exclusive ingredient options (e.g., milk types)
- **Material Database** - Track raw materials with costs and units
- **Inventory Deduction** - Automatic stock tracking when orders are placed

#### Advanced Discount System
- **Percent Discounts** - 10%, 20%, staff discount, etc.
- **Fixed Amount** - Deduct specific RM amounts
- **Price Override** - Set custom final price for special deals
- **Discount Reasons** - Track why discounts were applied
- **Per-item Discounts** - Apply different discounts to each cart item

#### Admin Dashboard Improvements
- **Daily Operational Stats** - Today's orders, revenue, items sold, pending orders
- **Grouped Quick Actions** - Organized by Operations, Inventory, Analytics, System
- **Streamlined UI** - Removed redundant sections and clutter
- **Real-time Updates** - Stats refresh automatically

### 🎨 **UI/UX IMPROVEMENTS**
- **Mascot Integration** - Coffee Oasis unicorn mascot on customer display
- **Kiosk Mode** - Navigation hidden on customer/kitchen displays
- **Responsive Grids** - All displays adapt to phone/tablet/desktop
- **Single Column Cart** - Customer display optimized for easy reading
- **Compact Kitchen Display** - Fits 3-4 orders on tablet screens

### 🐛 **CRITICAL FIXES**
- **Hydration Error** - Fixed time display server/client mismatch
- **Cross-device Sync** - Solved localStorage limitation with server-side storage
- **Cart Property Names** - Standardized on productId/retailPrice/finalPrice
- **Network Access** - Configured Next.js to accept connections from other devices

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Current Status](#current-status)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Key Features](#key-features)
6. [Multi-Screen Setup](#multi-screen-setup)
7. [File Structure](#file-structure)
8. [User Flows](#user-flows)
9. [API Routes](#api-routes)
10. [COGS & Recipe System](#cogs--recipe-system)
11. [Discount System](#discount-system)
12. [Hold Order System](#hold-order-system)
13. [State Management](#state-management)
14. [Environment Configuration](#environment-configuration)
15. [Setup Instructions](#setup-instructions)
16. [Future Enhancements](#future-enhancements)

---

## Project Overview

**Coffee Oasis** is a comprehensive Point of Sale (POS) system for a grab-and-go coffee shop. Built with Next.js and integrated with WooCommerce for product and order management. The system supports staff operations, customer displays, kitchen management, inventory tracking, and advanced pricing features.

**Live Store**: https://coffee-oasis.com.my

**Primary Use Case**: Staff-only admin app with multi-screen displays for POS, customer-facing, and kitchen operations.

---

## Current Status

### ✅ What's Working

**Core POS Features:**
- ✅ **Product Catalog** - Fetching from WooCommerce with categories and filters
- ✅ **Shopping Cart** - Advanced cart with discounts, bundles, and customizations
- ✅ **Checkout Flow** - Order creation with full metadata
- ✅ **Order Tracking** - Real-time status updates and kitchen timer
- ✅ **Payment Integration** - FiuuPay payment gateway (Malaysian)

**Admin & Staff Features:**
- ✅ **Hold Order System** - Manage multiple concurrent customers
- ✅ **Staff Discounts** - Percent, amount, and override pricing
- ✅ **Admin Dashboard** - Daily stats and quick actions
- ✅ **Order Management** - Full CRUD with status tracking
- ✅ **Customer Search** - Find and assign customers to orders

**Inventory & COGS:**
- ✅ **Materials Database** - Track ingredients, packaging, labor costs
- ✅ **Recipe Builder** - Define product compositions
- ✅ **COGS Calculation** - Automatic cost tracking
- ✅ **Bundle Products** - Mandatory and optional add-ons
- ✅ **XOR Groups** - Mutually exclusive ingredient options
- ✅ **Inventory Deduction** - Auto-track stock on order placement

**Multi-Screen System:**
- ✅ **Customer Display** - Real-time cart sync across devices
- ✅ **Kitchen Display** - Order queue with timers and status
- ✅ **Network Configuration** - Multi-device support over LAN
- ✅ **Kiosk Mode** - Clean displays without navigation

**UI/UX:**
- ✅ **Responsive Design** - Optimized for phone, tablet, desktop
- ✅ **Mascot Branding** - Custom Coffee Oasis unicorn
- ✅ **Clean Admin Interface** - Streamlined workflows
- ✅ **Real-time Updates** - 1-10 second polling intervals

### ⚠️ Known Limitations
- Locker system API exists but not fully implemented
- No customer-facing self-service app yet (admin/staff only)
- Polling-based updates (WebSockets not implemented)
- In-memory cart storage (resets on server restart)

### 🎯 Ready For
- ✅ Production deployment (staff operations)
- ✅ Multi-device POS setup (phone + tablets)
- ✅ Full inventory and cost tracking
- ⚠️ Customer self-service (future enhancement)

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
- **Image Handling**: Next.js Image component

### Backend
- **E-commerce Platform**: WooCommerce
- **API**: WooCommerce REST API v3
- **API Client**: @woocommerce/woocommerce-rest-api + Axios
- **Database**: SQLite (for recipes/materials)
- **Session Management**: In-memory storage + localStorage

### State Management
- React Context API (Cart, global state)
- LocalStorage (User sessions, held orders, cart backup)
- Server-side storage (Current cart for multi-device sync)

---

## System Architecture

### Multi-Screen Architecture
```
┌─────────────────┐
│   POS Device    │ (Small PC / Android - Runs Next.js server)
│  (Main Server)  │
│                 │
│  - Admin/POS UI │ localhost:3000/admin/pos
│  - Cart Context │
│  - API Routes   │
└────────┬────────┘
         │ Network (0.0.0.0:3000)
         │
    ┌────┴────┬──────────┬────────────┐
    │         │          │            │
┌───▼────┐ ┌─▼─────┐ ┌──▼────────┐ ┌─▼────────┐
│Customer│ │Kitchen│ │Customer   │ │Additional│
│Tablet 1│ │Tablet │ │Tablet 2   │ │Devices   │
│        │ │       │ │           │ │          │
│/customer│ │/kitchen│ │/customer │ │...       │
│-display│ │       │ │-display   │ │          │
└────────┘ └───────┘ └───────────┘ └──────────┘
```

### Data Flow
```
User Action (POS)
    ↓
Cart Context Update
    ↓
LocalStorage + Server API (/api/cart/current)
    ↓
Customer Displays Poll Server (1s interval)
    ↓
UI Updates Across All Devices
```

---

## Key Features

### 1. Multi-Screen POS System

**Network Setup:**
- POS device runs Next.js server on `0.0.0.0:3000`
- Other devices connect via `http://[POS-IP]:3000/[route]`
- Real-time cart synchronization across all screens
- No database required - in-memory + localStorage

**Display Types:**
1. **POS Display** (`/admin/pos`)
   - Full admin interface
   - Cart management with discounts
   - Hold order controls
   - Customer assignment

2. **Customer Display** (`/customer-display`)
   - Kiosk mode (no navigation)
   - Single column item list
   - Large, readable fonts
   - Mascot branding
   - Real-time cart sync (1s polling)

3. **Kitchen Display** (`/kitchen`)
   - 3-4 column grid (landscape optimized)
   - Order timers and status
   - Color-coded urgency (green→yellow→red)
   - Ready/Delivery buttons
   - Auto-refresh (10s polling)

**Setup Process:**
```bash
# On POS device
npm run dev  # or npm run start

# Find POS IP
ip addr show | grep inet

# On customer/kitchen tablets
Open browser to: http://192.168.1.100:3000/customer-display
```

### 2. Hold Order System

**Use Case:** Regular customer orders but needs time before paying, another customer walks in

**Features:**
- Hold current cart with customer assignment
- Auto-generate tags if no customer selected (YYMMDD_H###)
- Multiple holds supported simultaneously
- Resume any held order
- Delete old/cancelled holds
- 4-hour auto-cleanup

**Implementation:**
- **Storage**: LocalStorage (fast, no server needed)
- **UI**: Integrated into POS page
- **Customer Search**: Reuses admin/orders search pattern
- **Tag Format**: `250811_H001`, `250811_H002` (daily counter)

**Workflow:**
```
1. Customer A orders → Cart has items
2. Click "Hold Order"
3. Search customer or auto-generate tag
4. Cart clears → Order saved to held list
5. Serve Customer B
6. After Customer B completes → Resume Customer A's order
7. Complete transaction
```

### 3. COGS & Recipe System

**Purpose:** Track product costs and profit margins

**Components:**

**Materials Database:**
- Raw ingredients (coffee beans, milk, sugar, etc.)
- Packaging (cups, lids, sleeves, bags)
- Labor costs (per minute/hour)
- Unit conversions (g, ml, units, minutes)

**Recipe Builder:**
- Select base product from WooCommerce
- Add required materials with quantities
- Define mandatory ingredient groups (XOR)
- Add optional add-ons
- Calculate total COGS
- View retail price and profit margin

**Bundle Products:**
- Mandatory groups: Must select exactly one (e.g., milk type)
- Optional items: Can select multiple (e.g., extra shot, syrup)
- XOR logic: Selecting one deselects others in same group
- Price modifiers: Add-ons can increase final price

**COGS Calculation:**
```typescript
Material: 20g coffee beans @ RM 45/kg
= (20 / 1000) * 45 = RM 0.90

Labor: 2 minutes @ RM 15/hour
= (2 / 60) * 15 = RM 0.50

Total COGS = RM 1.40
Retail Price = RM 12.00
Profit = RM 10.60 (88.3%)
```

**Inventory Tracking:**
- Deducts materials when order is placed
- Shows low stock warnings
- Tracks usage per product
- Manual stock adjustments

### 4. Advanced Discount System

**Discount Types:**

1. **Percent Discount** (e.g., 10%, 20%, Staff 50%)
   ```
   Retail: RM 12.00
   Discount: 20%
   Final: RM 9.60
   ```

2. **Fixed Amount** (e.g., RM 5 off)
   ```
   Retail: RM 12.00
   Discount: -RM 5.00
   Final: RM 7.00
   ```

3. **Price Override** (Set exact price)
   ```
   Retail: RM 12.00
   Override: RM 8.00
   Final: RM 8.00
   ```

**Features:**
- Per-item discounts (different for each product)
- Discount reasons (tracked for reporting)
- Visual indicators (strikethrough prices)
- Saved discounts shown on customer display
- Staff mode required for discount access

**UI:**
- Quick buttons (10%, 20%, 50%)
- Custom amount input
- Reason dropdown + custom input
- Clear discount option
- Visual feedback on cart items

### 5. Admin Dashboard

**Daily Stats:**
- Today's Orders (count)
- Today's Revenue (total RM)
- Items Sold (quantity)
- Pending Orders (count)

**Quick Actions (Grouped):**

**Operations:**
- Point of Sale (green highlight)
- Order Management

**Inventory & Recipes:**
- Materials
- Recipes

**Analytics:**
- Sales Reports (blue highlight)

**System & Customer:**
- Locker Monitoring
- Printers
- Loyalty Points

**Features:**
- Real-time stats refresh
- One-click navigation
- Clean, organized layout
- Removed redundant sections

---

## Multi-Screen Setup

### Hardware Requirements

**Minimum Setup:**
- 1x Small PC or Android device (POS device - runs server)
- 1x Tablet (customer display)
- Network: WiFi or LAN

**Recommended Setup:**
- 1x Small PC (POS device)
- 1-2x Tablets (customer displays)
- 1x Tablet landscape (kitchen display)
- Network: Dedicated WiFi network

### Network Configuration

**package.json:**
```json
{
  "scripts": {
    "dev": "next dev -H 0.0.0.0",
    "start": "next start -H 0.0.0.0"
  }
}
```

**Security Notes:**
- Only accessible on local network
- No authentication on display endpoints
- Use WiFi with WPA2+ encryption
- Consider firewall rules for production

### Tablet Setup (Customer/Kitchen)

**For Android:**
1. Install "Fully Kiosk Browser" or "Kiosk Browser Lockdown"
2. Enter URL: `http://[POS-IP]:3000/customer-display`
3. Enable fullscreen mode
4. Disable sleep mode
5. Lock orientation (landscape for kitchen, portrait for customer)
6. Disable back button
7. Auto-reload on connection loss

**For iOS:**
1. Use Safari or Chrome
2. Open URL: `http://[POS-IP]:3000/customer-display`
3. Add to Home Screen
4. Use Guided Access for kiosk mode
5. Settings → Display → Auto-Lock → Never

---

## File Structure

### Core Application Files
```
/app
  /page.tsx                            # Home/landing page
  /layout.tsx                          # Root layout with CartProvider

  # Customer-facing
  /products/page.tsx                   # Product catalog (3-5 cols responsive)
  /checkout/page.tsx                   # Checkout flow
  /payment/page.tsx                    # Payment gateway integration
  /orders/page.tsx                     # Order history
  /orders/[orderId]/page.tsx           # Order detail/tracking

  # Admin/Staff
  /admin/page.tsx                      # Admin dashboard with stats
  /admin/pos/page.tsx                  # Point of Sale interface
  /admin/orders/page.tsx               # Order management
  /admin/materials/page.tsx            # Materials database
  /admin/recipes/page.tsx              # Recipe builder
  /admin/sales/page.tsx                # Sales reports
  /admin/lockers/page.tsx              # Locker monitoring

  # Multi-Screen Displays
  /customer-display/page.tsx           # Customer kiosk display
  /customer-display/layout.tsx         # No HeaderNav layout
  /kitchen/page.tsx                    # Kitchen order display

  # API Routes
  /api
    /cart/current/route.ts             # Server-side cart storage
    /admin/daily-stats/route.ts        # Dashboard statistics
    /admin/customers/route.ts          # Customer search
    /products/[id]/recipe/route.ts     # Recipe data fetching
    /create-order/route.ts             # Order creation
    /orders/route.ts                   # Order listing
    /kitchen/orders/route.ts           # Kitchen order queue
    /locker/heartbeat/route.ts         # Locker status updates
    /locker/unlock/route.ts            # Locker unlock webhook
```

### Shared Libraries
```
/lib
  /wooClient.ts                        # WooCommerce API client
  /orderService.ts                     # Order CRUD operations
  /db.ts                               # SQLite database connection
```

### Components
```
/components
  /HeaderNav.tsx                       # Navigation (hidden on kiosk)
  /HoldOrderManager.tsx                # Hold order UI
  /ProductSelectionModal.tsx           # Bundle product selector
```

### State Management
```
/context
  /cartContext.tsx                     # Cart state + server sync
```

### Database
```
/database.sqlite                       # Materials & recipes storage
```

---

## User Flows

### Staff POS Workflow

```
1. Staff opens /admin/pos on POS device

2. Customer Display shows empty cart (on tablet)

3. Staff clicks Products → Browse menu

4. Staff adds items to cart
   - Simple products: Direct add
   - Bundle products: Modal with mandatory/optional selections

5. Customer Display updates in real-time (1s sync)

6. Apply discounts (if staff mode active)
   - Select discount type
   - Enter amount/percent
   - Add reason

7. Options:
   A. Complete Order:
      - Click "Proceed to Payment"
      - Process payment
      - Cart clears

   B. Hold Order:
      - Click "Hold Order"
      - Search customer or auto-generate tag
      - Cart clears, saved to held list
      - Serve next customer
      - Resume held order later
```

### Kitchen Display Workflow

```
1. Order marked as "processing" after payment

2. Appears in Kitchen Display grid

3. Timer starts (2 min per item)
   - Green border: On time
   - Yellow border: 70%+ elapsed
   - Red border: Overdue

4. Staff prepares order

5. Click "Ready for Pickup" or "Ready for Delivery"

6. Order removed from kitchen display

7. Moves to ready status
```

---

## API Routes

### New Routes (v3.0)

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/cart/current` | GET | Get current cart (server-side) | None |
| `/api/cart/current` | POST | Update cart (for sync) | None |
| `/api/admin/daily-stats` | GET | Dashboard statistics | None |
| `/api/admin/customers` | GET | Search customers | None |
| `/api/kitchen/orders` | GET | Kitchen order queue | None |
| `/api/products/[id]/recipe` | GET | Product recipe data | None |

### Cart Sync API

**POST /api/cart/current**
```json
{
  "cart": [
    {
      "productId": 45,
      "name": "Hot Latte",
      "retailPrice": 12.00,
      "finalPrice": 9.60,
      "quantity": 2,
      "discountPercent": 20,
      "discountReason": "Staff discount"
    }
  ]
}
```

**Response:**
```json
{
  "success": true
}
```

**GET /api/cart/current**
```json
{
  "cart": [...] // Same structure as POST
}
```

---

## COGS & Recipe System

### Database Schema (SQLite)

**materials table:**
```sql
CREATE TABLE materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  cost REAL NOT NULL,
  unit TEXT NOT NULL,
  stock_quantity REAL,
  supplier TEXT,
  notes TEXT
);
```

**recipes table:**
```sql
CREATE TABLE recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  materials JSON NOT NULL,  -- [{material_id, quantity}]
  total_cogs REAL NOT NULL,
  created_at TEXT,
  updated_at TEXT
);
```

### Recipe Calculation

```typescript
// Example recipe for Hot Latte
{
  "product_id": 45,
  "product_name": "Hot Latte",
  "materials": [
    { "material_id": 1, "name": "Coffee Beans", "quantity": 18, "unit": "g", "cost": 0.81 },
    { "material_id": 2, "name": "Whole Milk", "quantity": 200, "unit": "ml", "cost": 1.20 },
    { "material_id": 5, "name": "12oz Paper Cup", "quantity": 1, "unit": "unit", "cost": 0.50 },
    { "material_id": 8, "name": "Labor", "quantity": 2.5, "unit": "minutes", "cost": 0.625 }
  ],
  "total_cogs": 3.125,
  "retail_price": 12.00,
  "profit": 8.875,
  "profit_margin": 73.96
}
```

---

## Discount System

### Cart Item Structure

```typescript
interface CartItem {
  productId: number;
  name: string;
  retailPrice: number;      // Original price
  discountPercent?: number; // e.g., 20 (for 20%)
  discountAmount?: number;  // e.g., 5.00 (RM 5 off)
  discountReason?: string;  // e.g., "Staff discount"
  finalPrice: number;       // Calculated price
  quantity: number;
  bundle?: {                // Optional: for bundle products
    baseProductId: number;
    baseProductName: string;
    selectedMandatory: Record<string, string>;
    selectedOptional: string[];
  };
}
```

### Price Calculation Logic

```typescript
function calculateFinalPrice(item: CartItem): number {
  const { retailPrice, discountPercent, discountAmount } = item;

  // Fixed amount takes precedence
  if (discountAmount !== undefined && discountAmount > 0) {
    return Math.max(0, retailPrice - discountAmount);
  }

  // Then percent discount
  if (discountPercent !== undefined && discountPercent > 0) {
    return retailPrice * (1 - discountPercent / 100);
  }

  // No discount
  return retailPrice;
}
```

---

## Hold Order System

### Data Structure

```typescript
interface HeldOrder {
  id: string;              // UUID
  customerName: string;    // Name or auto-generated tag
  customerId?: number;     // WooCommerce customer ID (if assigned)
  cartItems: CartItem[];   // Full cart state
  total: number;           // Final total with discounts
  timestamp: number;       // Date.now() when held
  isAutoGenerated: boolean; // True if using auto-tag
}
```

### Auto-Tag Generation

```typescript
// Format: YYMMDD_H###
// Example: 250811_H001, 250811_H002

function generateHoldTag(): string {
  const now = new Date();
  const dateStr = now.toISOString()
    .slice(2, 10)
    .replace(/-/g, ''); // YYMMDD

  // Find highest counter for today
  const todayOrders = heldOrders.filter(o =>
    o.isAutoGenerated && o.customerName.startsWith(dateStr)
  );

  let maxCounter = 0;
  todayOrders.forEach(o => {
    const match = o.customerName.match(/_H(\d+)$/);
    if (match) {
      maxCounter = Math.max(maxCounter, parseInt(match[1]));
    }
  });

  const nextCounter = maxCounter + 1;
  return `${dateStr}_H${String(nextCounter).padStart(3, '0')}`;
}
```

### Storage & Cleanup

**Storage:** localStorage key `heldOrders`
**Auto-Cleanup:** Runs every 60 seconds
**Threshold:** 4 hours

```typescript
const AUTO_CLEANUP_HOURS = 4;

function cleanupOldOrders() {
  const cutoffTime = Date.now() - (AUTO_CLEANUP_HOURS * 60 * 60 * 1000);
  const filtered = heldOrders.filter(order =>
    order.timestamp > cutoffTime
  );

  if (filtered.length < heldOrders.length) {
    saveHeldOrders(filtered);
  }
}
```

---

## State Management

### Cart Context (Enhanced)

**Location:** `context/cartContext.tsx`

**New Methods:**
```typescript
interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: Omit<CartItem, 'finalPrice'>) => void;
  removeFromCart: (index: number) => void;
  updateItemDiscount: (index: number, discount: {
    type: 'percent' | 'amount' | 'override',
    value: number,
    reason?: string
  }) => void;
  clearCart: () => void;
  loadCart: (items: CartItem[]) => void; // For resuming held orders
}
```

**Server Sync:**
```typescript
useEffect(() => {
  // Save to localStorage
  localStorage.setItem('cart', JSON.stringify(cartItems));

  // Sync to server for multi-device
  fetch('/api/cart/current', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart: cartItems })
  });
}, [cartItems]);
```

### LocalStorage Keys

| Key | Type | Purpose | TTL |
|-----|------|---------|-----|
| `cart` | CartItem[] | Current cart items | Session |
| `heldOrders` | HeldOrder[] | Held orders list | 4 hours |
| `userId` | number | WooCommerce customer ID | 30 days |
| `guestId` | UUID | Anonymous user ID | Persistent |
| `admin_auth` | string | Admin session token | Session |

---

## Environment Configuration

### Required Variables

```env
# Network Configuration (Multi-Screen)
# Next.js listens on all network interfaces
# Package.json already configured with -H 0.0.0.0

# WooCommerce Store
WC_STORE_URL=https://coffee-oasis.com.my
NEXT_PUBLIC_WC_STORE_URL=https://coffee-oasis.com.my

# WooCommerce API Credentials
WC_CONSUMER_KEY=ck_xxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxx

# Database
DATABASE_PATH=./database.sqlite
```

### Network Setup

**package.json (already configured):**
```json
{
  "scripts": {
    "dev": "next dev -H 0.0.0.0",
    "start": "next start -H 0.0.0.0"
  }
}
```

This allows other devices to connect to the POS server over the network.

---

## Setup Instructions

### Quick Start (Single Device Development)

```bash
# Clone repository
git clone https://github.com/kayuwoody/ren1.git
cd ren1

# Install dependencies
npm install

# Run development server
npm run dev

# Open browser
http://localhost:3000
```

### Multi-Screen Production Setup

**1. POS Device (Main Server):**
```bash
# Install dependencies
npm install

# Build for production
npm run build

# Start server
npm run start

# Server now running on 0.0.0.0:3000
```

**2. Find POS IP Address:**
```bash
# Linux/Mac
ip addr show | grep inet

# Windows
ipconfig

# Example output: 192.168.1.100
```

**3. Connect Customer Display (Tablet):**
```
Open browser to: http://192.168.1.100:3000/customer-display

Set to fullscreen/kiosk mode
Disable sleep
```

**4. Connect Kitchen Display (Tablet):**
```
Open browser to: http://192.168.1.100:3000/kitchen

Landscape orientation
Fullscreen mode
```

**5. Verify Sync:**
- Add item on POS
- Should appear on customer display within 1 second
- Should appear on kitchen display after payment

### Database Setup

```bash
# Database file is created automatically on first run
# Location: ./database.sqlite

# To reset database (WARNING: Deletes all data)
rm database.sqlite

# Restart server to recreate
npm run start
```

---

## Future Enhancements

### High Priority (Next Sprint)
1. **Locker Integration** - Full implementation with assignment automation
2. **Customer Self-Service App** - Let customers order and pay themselves
3. **WebSocket Updates** - Replace polling with real-time push
4. **Production Payment Gateway** - Full FiuuPay integration testing
5. **Receipt Printing** - Thermal printer support

### Medium Priority
6. **Staff Accounts** - Individual login tracking
7. **Advanced Reporting** - Sales by period, product, category
8. **Inventory Alerts** - Low stock notifications
9. **Mobile POS** - Responsive admin on phone
10. **Backup & Restore** - Database export/import

### Nice to Have
11. **Multi-language** - Malay, Chinese support
12. **Dark Mode** - Theme toggle
13. **Order Scheduling** - Pre-orders with pickup time
14. **Loyalty Integration** - Points redemption in cart
15. **Split Payment** - Multiple payment methods per order

---

## Technical Debt & Notes for AI

### Known Issues to Address
1. **In-Memory Cart Storage** - Resets on server restart
   - Consider: Redis for production multi-instance
   - Current: Acceptable for single-device setup

2. **Polling vs WebSockets** - Multiple 1-10s intervals
   - Customer display: 1s (cart sync)
   - Kitchen display: 10s (order updates)
   - Consider: Socket.io or Server-Sent Events

3. **No Server Authentication** - Display endpoints open
   - Current: Relies on local network security
   - Consider: Token-based auth for displays

4. **SQLite for Recipes** - Local file database
   - Current: Works for single instance
   - Consider: PostgreSQL for production

### Code Quality Improvements
1. Add TypeScript strict mode
2. Replace `any` types with proper interfaces
3. Add error boundaries
4. Implement retry logic for API calls
5. Add loading skeletons
6. Add unit tests
7. Add E2E tests with Playwright

### Performance Optimizations
1. Implement React Query for caching
2. Add service worker for offline support
3. Optimize bundle size (code splitting)
4. Add image optimization
5. Implement virtual scrolling for large lists

### Security Enhancements
1. Add CSRF protection
2. Implement rate limiting
3. Add input validation
4. Sanitize user inputs
5. Add security headers

---

## Important AI Helper Notes

### When Working on This Codebase

**Cart System:**
- Cart items use `productId` (not `id`)
- Price fields: `retailPrice` (original) and `finalPrice` (after discount)
- Always calculate `finalPrice` when modifying discounts
- Sync to server after every cart change for multi-device support

**Hold Orders:**
- Stored in localStorage, cleaned up after 4 hours
- Auto-tags format: YYMMDD_H### (daily counter)
- Use `loadCart()` to resume a held order
- Clear current cart before loading held order

**Multi-Screen:**
- Customer display polls server every 1 second
- Kitchen display polls every 10 seconds
- All displays hide HeaderNav (check pathname)
- Server runs on 0.0.0.0:3000 for network access

**COGS & Recipes:**
- SQLite database in `./database.sqlite`
- Recipes link to WooCommerce product IDs
- Materials have category, cost, unit, stock
- Calculate COGS by summing all material costs

**Discounts:**
- Three types: percent, amount, override
- Store reason for tracking
- Update `finalPrice` immediately
- Show visual indicators (strikethrough)

**Admin Dashboard:**
- Stats refresh on mount and manual refresh
- Quick actions grouped by function
- Removed redundant sections (Costs Overview)
- Uses WooCommerce API for real-time data

**Responsive Design:**
- Products: 3-5 columns (mobile to desktop)
- Customer display: Single column only
- Kitchen display: 3-4 columns (landscape optimized)
- Use Tailwind responsive classes

**Key Files to Remember:**
- `context/cartContext.tsx` - Cart state + server sync
- `components/HoldOrderManager.tsx` - Hold order logic
- `app/api/cart/current/route.ts` - Server-side cart storage
- `components/HeaderNav.tsx` - Kiosk mode check
- `lib/db.ts` - SQLite database connection

### Common Pitfalls
1. Don't forget to sync cart to server after updates
2. Always check if HeaderNav should be hidden (pathname check)
3. Calculate finalPrice when setting discounts
4. Clean up intervals/timers in useEffect cleanup
5. Handle empty/null states in customer display

---

## Changelog

### Version 3.0.0 (November 9, 2025)

**🎉 Major New Features:**
- Multi-screen POS system with network configuration
- Hold Order system with auto-generated tags
- Server-side cart syncing for cross-device updates
- COGS calculation and recipe builder
- Advanced discount system (percent/amount/override)
- Customer display with mascot and kiosk mode
- Kitchen display optimized for tablets
- Admin dashboard with daily operational stats

**🎨 UI/UX Improvements:**
- Responsive grids for all displays
- Mascot integration (Coffee Oasis unicorn)
- Single column customer display
- Compact kitchen display (3-4 columns)
- Streamlined admin interface
- Removed redundant sections

**🐛 Bug Fixes:**
- Fixed hydration error in customer display
- Fixed cross-device cart sync issue
- Standardized cart property names
- Fixed network access configuration

**🗑️ Removed:**
- Costs Overview page (redundant with Recipes)
- Large Add Products button from POS
- Redundant sidebar widgets

### Version 2.0.0 (October 23, 2025)
- Mock API for development
- Cart property fixes
- Navigation improvements
- Codebase cleanup

### Version 1.0.0 (July 3, 2025)
- Initial POS implementation
- WooCommerce integration
- Basic features

---

## Contact & Support

**Repository:** https://github.com/kayuwoody/ren1
**Store:** https://coffee-oasis.com.my
**Framework:** https://nextjs.org/docs
**WooCommerce API:** https://woocommerce.github.io/woocommerce-rest-api-docs/

---

**Last Updated:** November 9, 2025
**Version:** 3.0.0
**Status:** ✅ Production Ready (Staff/Admin App)
**Author:** Coffee Oasis Team
