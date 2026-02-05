# Locker Branch - Coffee Oasis

**Branch:** `locker` (forked from main POS codebase)
**Hardware:** HP T730 thin client + IoT controllers
**Network:** LTE (mobile internet)
**Role:** Dumb POS - order taking + hardware control only

---

## Overview

The locker branch is a stripped-down fork of the main POS codebase. It runs independently on T730 mini PCs at locker locations, syncing with the main POS over LTE.

```
┌─────────────────────────────────────────────────────────────┐
│                     LOCKER (T730)                           │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Order UI   │  │   Sync      │  │   IoT Controller    │ │
│  │  (PWA)      │  │   Client    │  │   (Hardware)        │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                     │            │
│         └────────────────┼─────────────────────┘            │
│                          │                                  │
│                   ┌──────▼──────┐                           │
│                   │   Next.js   │                           │
│                   │   + SQLite  │                           │
│                   │   (cache)   │                           │
│                   └──────┬──────┘                           │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │ LTE
                           ▼
                    ┌─────────────┐
                    │  Main POS   │
                    │  (cloud/    │
                    │   on-prem)  │
                    └─────────────┘
```

---

## What Locker Does

### Core Functions
1. **Display menu** - Products cached locally, synced from main POS
2. **Take orders** - Customer selects items, pays via Fiuu
3. **Push orders to main** - Kitchen at main location prepares
4. **Receive order updates** - WebSocket notifies when order ready
5. **Dispense items** - Unlock compartment when customer enters pickup code
6. **Handle pickup** - Verify code, unlock, mark order complete

### Hardware Control
- **Compartment locks** - Electronic locks, GPIO or serial control
- **Sensors** - Door open/close detection
- **Display** - Chromium in kiosk mode (fullscreen, no URL bar)
- **Optional:** Receipt printer, card reader, QR scanner

---

## What to Remove from Main POS

The locker branch strips out admin/management features:

| Remove | Reason |
|--------|--------|
| `/app/admin/*` | No admin on locker |
| `/app/kitchen/*` | Kitchen is at main POS |
| `/app/delivery/*` | No delivery management |
| `/api/admin/*` | No admin APIs |
| `/api/kitchen/*` | No kitchen APIs |
| Recipe management | Read-only from main |
| Material management | Read-only from main |
| Purchase orders | Main POS only |
| Sales reports | Main POS only |
| Stock adjustments | Main POS only |

### Keep (Modified)
| Keep | Modifications |
|------|---------------|
| `/app/customer/*` | Main UI for locker |
| `/api/orders/*` | Modified to push to main |
| `/api/products/*` | Read from local cache |
| Product display | Simplified, customer-facing |
| Cart/checkout | Core ordering flow |
| Payment (Fiuu) | Direct integration |

### Add New
| Add | Purpose |
|-----|---------|
| `/api/sync/*` | Sync endpoints |
| `/api/hardware/*` | IoT control |
| `/lib/sync/*` | Sync client |
| `/lib/hardware/*` | Hardware drivers |
| `/app/kiosk/*` | Kiosk-specific UI |
| `/app/pickup/*` | Pickup code entry UI |

---

## Sync Architecture

### Main POS → Locker (WebSocket)

Locker connects to main POS WebSocket. Main pushes updates:

```typescript
// Messages from Main POS
interface SyncMessage {
  type: 'product_update' | 'inventory_update' | 'customer_update' | 'order_status';
  payload: any;
  timestamp: string;
}

// Product update
{
  type: 'product_update',
  payload: {
    action: 'upsert' | 'delete',
    product: { id, name, price, image, category, stock }
  }
}

// Inventory update
{
  type: 'inventory_update',
  payload: {
    productId: string,
    stockQuantity: number
  }
}

// Order status (for pickup notification)
{
  type: 'order_status',
  payload: {
    orderId: string,
    status: 'ready-for-pickup',
    compartmentId: string,
    pickupCode: string
  }
}
```

### Locker → Main POS (HTTP POST)

Locker pushes orders to main:

```typescript
// POST /api/sync/orders (on main POS)
{
  lockerId: string,
  order: {
    id: string,           // Local order ID
    lineItems: [...],
    customerId?: string,
    paymentStatus: 'paid',
    paymentRef: string,   // Fiuu transaction ID
    createdAt: string
  }
}

// Response
{
  success: true,
  mainOrderId: string,    // ID assigned by main POS
  estimatedReady: string  // ISO timestamp
}
```

### Offline Queue

When LTE is down, orders queue locally:

```typescript
// SQLite table on locker
CREATE TABLE SyncQueue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- 'order', 'pickup_confirm'
  payload TEXT NOT NULL,     -- JSON
  attempts INTEGER DEFAULT 0,
  lastAttempt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Sync client retries with exponential backoff when connection restored.

---

## Hardware Integration

### Compartment Control

```typescript
// lib/hardware/lockerController.ts

interface Compartment {
  id: string;
  number: number;
  size: 'S' | 'M' | 'L';
  isLocked: boolean;
  isOccupied: boolean;
  currentOrderId?: string;
}

interface LockerController {
  // Get all compartments status
  getCompartments(): Promise<Compartment[]>;

  // Unlock specific compartment
  unlock(compartmentId: string): Promise<boolean>;

  // Lock compartment (after door closes)
  lock(compartmentId: string): Promise<boolean>;

  // Check if door is open
  isDoorOpen(compartmentId: string): Promise<boolean>;

  // Listen for door events
  onDoorEvent(callback: (compartmentId: string, event: 'open' | 'close') => void): void;
}
```

### GPIO/Serial Implementation

```typescript
// lib/hardware/drivers/gpio.ts (for Raspberry Pi GPIO)
// lib/hardware/drivers/serial.ts (for serial-connected controllers)
// lib/hardware/drivers/mock.ts (for development)

// Environment variable selects driver
// LOCKER_DRIVER=gpio | serial | mock
```

### Hardware API Endpoints

```typescript
// GET /api/hardware/compartments
// Returns status of all compartments

// POST /api/hardware/compartments/:id/unlock
// Unlocks specific compartment

// GET /api/hardware/compartments/:id/status
// Check door open/closed, locked/unlocked

// WebSocket /api/hardware/stream
// Real-time door events
```

---

## Pickup Flow

### Customer Arrives at Locker

```
1. Customer approaches locker screen
2. Taps "Pick Up Order"
3. Enters 6-digit pickup code (or scans QR)
4. System verifies code against local cache + main POS
5. If valid:
   - Unlock compartment
   - Display "Door X is open, please take your order"
   - Wait for door close event
   - Mark order as picked up
   - Sync to main POS
6. If invalid:
   - Display error
   - Offer retry or contact support
```

### Pickup Code Verification

```typescript
// Local-first verification (fast, works offline)
async function verifyPickupCode(code: string): Promise<PickupResult> {
  // 1. Check local cache first
  const localOrder = db.prepare(`
    SELECT * FROM CachedOrders
    WHERE pickupCode = ? AND status = 'ready-for-pickup'
  `).get(code);

  if (localOrder) {
    return { valid: true, order: localOrder, source: 'cache' };
  }

  // 2. If not in cache, check with main POS (if online)
  if (isOnline()) {
    const response = await fetch(`${MAIN_POS_URL}/api/sync/verify-pickup`, {
      method: 'POST',
      body: JSON.stringify({ code, lockerId: LOCKER_ID })
    });

    if (response.ok) {
      const order = await response.json();
      // Cache for future (in case connection drops)
      cacheOrder(order);
      return { valid: true, order, source: 'main' };
    }
  }

  return { valid: false };
}
```

---

## Kiosk Mode Setup

### Chromium Kiosk

```bash
# /etc/xdg/autostart/kiosk.desktop
[Desktop Entry]
Type=Application
Name=Locker Kiosk
Exec=chromium-browser --kiosk --disable-infobars --disable-session-crashed-bubble --app=http://localhost:3000/kiosk
```

### Disable System UI

```bash
# Disable screen saver, power management
xset s off
xset -dpms
xset s noblank

# Hide cursor after inactivity
unclutter -idle 3 &
```

### Auto-start Next.js

```bash
# /etc/systemd/system/locker-pos.service
[Unit]
Description=Locker POS
After=network.target

[Service]
Type=simple
User=kiosk
WorkingDirectory=/home/kiosk/locker-pos
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## Environment Variables

```bash
# .env.local for locker

# Identity
LOCKER_ID=locker-001
LOCKER_NAME="Sunway Pyramid L1"

# Main POS connection
MAIN_POS_URL=https://pos.coffee-oasis.com.my
MAIN_POS_WS_URL=wss://pos.coffee-oasis.com.my/ws
SYNC_API_KEY=sk_locker_xxxxx

# Payment
FIUU_MERCHANT_ID=xxxxx
FIUU_VERIFY_KEY=xxxxx
FIUU_SECRET_KEY=xxxxx

# Hardware
LOCKER_DRIVER=serial          # gpio | serial | mock
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUD=9600

# Kiosk
KIOSK_MODE=true
IDLE_TIMEOUT_MS=60000         # Return to home after 1 min idle

# Offline
OFFLINE_QUEUE_MAX=100         # Max orders to queue offline
SYNC_RETRY_INTERVAL_MS=30000  # Retry sync every 30s
```

---

## Database Schema (Locker-specific)

```sql
-- Products cache (synced from main)
CREATE TABLE CachedProducts (
  id TEXT PRIMARY KEY,
  wcId INTEGER,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT,
  imageUrl TEXT,
  stockQuantity INTEGER,
  syncedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Orders created on this locker
CREATE TABLE LocalOrders (
  id TEXT PRIMARY KEY,
  lineItems TEXT NOT NULL,      -- JSON
  customerId TEXT,
  total REAL NOT NULL,
  paymentStatus TEXT DEFAULT 'pending',
  paymentRef TEXT,
  mainOrderId TEXT,             -- Assigned by main POS after sync
  status TEXT DEFAULT 'pending',
  pickupCode TEXT,
  compartmentId TEXT,
  syncedAt TEXT,                -- NULL if not yet synced
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Sync queue (orders pending upload)
CREATE TABLE SyncQueue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  lastAttempt TEXT,
  error TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Compartment state
CREATE TABLE Compartments (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  size TEXT DEFAULT 'M',
  isLocked INTEGER DEFAULT 1,
  currentOrderId TEXT,
  lastUpdated TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Pickup codes cache (for offline verification)
CREATE TABLE CachedPickupCodes (
  code TEXT PRIMARY KEY,
  orderId TEXT NOT NULL,
  compartmentId TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  syncedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## File Structure (Locker Branch)

```
locker-pos/
├── app/
│   ├── kiosk/                  # Main kiosk UI
│   │   ├── page.tsx            # Home screen (order or pickup)
│   │   ├── menu/               # Product browsing
│   │   ├── cart/               # Cart management
│   │   ├── checkout/           # Payment flow
│   │   └── pickup/             # Pickup code entry
│   ├── api/
│   │   ├── products/           # Read from cache
│   │   ├── orders/             # Create + sync
│   │   ├── sync/               # Sync endpoints
│   │   │   ├── status/         # Connection status
│   │   │   ├── push/           # Manual push trigger
│   │   │   └── webhook/        # Receive from main
│   │   └── hardware/           # IoT control
│   │       ├── compartments/
│   │       ├── unlock/
│   │       └── stream/         # Door events
│   └── layout.tsx
├── lib/
│   ├── db/
│   │   ├── init.ts             # SQLite setup
│   │   ├── productCache.ts     # Cached products
│   │   ├── localOrders.ts      # Local order storage
│   │   └── syncQueue.ts        # Offline queue
│   ├── sync/
│   │   ├── client.ts           # WebSocket client
│   │   ├── orderPush.ts        # Push orders to main
│   │   ├── productSync.ts      # Receive product updates
│   │   └── offlineQueue.ts     # Queue management
│   ├── hardware/
│   │   ├── controller.ts       # Abstract interface
│   │   ├── drivers/
│   │   │   ├── gpio.ts         # Raspberry Pi
│   │   │   ├── serial.ts       # Serial controller
│   │   │   └── mock.ts         # Development
│   │   └── compartments.ts     # Compartment state
│   └── payment/
│       └── fiuu.ts             # Direct Fiuu integration
├── components/
│   ├── KioskHome.tsx
│   ├── ProductGrid.tsx
│   ├── CartSummary.tsx
│   ├── PaymentScreen.tsx
│   ├── PickupCodeEntry.tsx
│   └── CompartmentStatus.tsx
├── public/
│   └── ...
├── package.json
└── .env.local
```

---

## Main POS Changes Required

To support lockers, main POS needs:

### New Endpoints

```typescript
// POST /api/sync/orders
// Receive orders from lockers

// POST /api/sync/verify-pickup
// Verify pickup code from locker

// POST /api/sync/pickup-complete
// Locker confirms customer picked up

// GET /api/sync/products
// Locker fetches full product catalog

// WebSocket /ws
// Push updates to connected lockers
```

### WebSocket Server

```typescript
// lib/ws/server.ts
// Tracks connected lockers
// Broadcasts product/inventory/order updates

interface ConnectedLocker {
  id: string;
  name: string;
  ws: WebSocket;
  lastPing: Date;
}

// Broadcast to all lockers
function broadcastToLockers(message: SyncMessage) {
  connectedLockers.forEach(locker => {
    locker.ws.send(JSON.stringify(message));
  });
}
```

### Order Assignment

When locker order comes in:
1. Create order in main POS
2. Assign to kitchen queue
3. When ready, assign compartment + generate pickup code
4. Push status to locker via WebSocket

---

## Development Workflow

### 1. Create Locker Branch

```bash
git checkout main
git checkout -b locker
```

### 2. Strip Admin Features

Remove `/app/admin`, `/api/admin`, etc.

### 3. Add Sync Layer

Implement WebSocket client, order push, offline queue.

### 4. Add Hardware Abstraction

Create mock driver first, test without hardware.

### 5. Build Kiosk UI

Simplified customer-facing order flow.

### 6. Test with Mock Hardware

```bash
LOCKER_DRIVER=mock npm run dev
```

### 7. Deploy to T730

- Install Node.js
- Clone locker branch
- Configure systemd service
- Set up kiosk mode
- Connect hardware
- Switch to real driver

---

## Testing

### Mock Mode

```bash
# Run locker in mock mode (no hardware)
LOCKER_DRIVER=mock npm run dev
```

### Simulate Sync

```bash
# Manually trigger product sync
curl -X POST http://localhost:3000/api/sync/pull-products

# Simulate order push
curl -X POST http://localhost:3000/api/sync/push-orders
```

### Hardware Test

```bash
# Test compartment unlock (mock)
curl -X POST http://localhost:3000/api/hardware/compartments/1/unlock
```

---

## Monitoring

### Health Check

```typescript
// GET /api/health
{
  status: 'ok',
  lockerId: 'locker-001',
  mainPosConnected: true,
  lastSync: '2026-01-26T10:30:00Z',
  queuedOrders: 0,
  compartments: {
    total: 12,
    available: 8,
    occupied: 4
  }
}
```

### Alerts

- LTE connection lost > 5 minutes
- Sync queue > 10 orders
- Hardware error (lock/sensor failure)
- Payment failures

---

## Security

### API Authentication

```typescript
// Locker authenticates to main POS
headers: {
  'X-Locker-ID': 'locker-001',
  'X-API-Key': process.env.SYNC_API_KEY
}
```

### Pickup Code Security

- 6-digit codes, expire after 24 hours
- Rate limit verification attempts (5 per minute)
- Log all attempts for audit

### Kiosk Hardening

- Disable keyboard shortcuts (Alt+F4, Ctrl+Alt+Del)
- No access to file system
- Automatic restart on crash
- Remote monitoring

---

## References

- `ARCHITECTURE_ROADMAP.md` - Overall system architecture
- `AI_ASSISTANT_GUIDE.md` - Development guidelines
- Main POS codebase - Base for locker fork

---

**Document Owner:** Development Team
**Created:** January 2026
