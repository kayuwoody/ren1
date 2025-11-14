# ☕ Coffee Oasis POS System

**Production v1.0** - Professional Point of Sale system for Coffee Oasis grab-and-go coffee shop

[![Status](https://img.shields.io/badge/status-production-success)](https://coffee-oasis.com.my)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](./CHANGELOG.md)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![License](https://img.shields.io/badge/license-Private-red)]()

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev

# Production
npm run build
npm run start
```

Visit `http://localhost:3000` and login with admin credentials.

---

## 📋 Features

### Core POS
- ✅ **Multi-screen system** - POS, Customer Display, Kitchen Display
- ✅ **WooCommerce integration** - Real-time product and order sync
- ✅ **Advanced discounts** - 10%, 15%, 20%, 25%, 50%, 🦄Free (100% Unicorns)
- ✅ **Hold orders** - Manage multiple concurrent customers
- ✅ **Bundle products** - Support for combos with add-ons

### Kitchen Management
- ✅ **Kitchen display** - Auto-fit grid optimized for tablets
- ✅ **Order timers** - Color-coded priority system
- ✅ **Real-time updates** - Orders appear instantly after payment
- ✅ **Mark ready** - One-click order completion

### Inventory & COGS
- ✅ **Recipe builder** - Define product recipes with materials
- ✅ **Automatic COGS** - Cost tracking per product
- ✅ **Stock management** - Deduct inventory on sales
- ✅ **Material database** - Track raw materials and packaging

### Receipts
- ✅ **Static HTML receipts** - Hosted on Hostinger
- ✅ **FTP auto-upload** - Receipts generated after payment
- ✅ **Mascot branding** - Coffee Oasis logo on all receipts
- ✅ **Discount tracking** - Full pricing breakdown

### Admin Dashboard
- ✅ **Daily stats** - Revenue, orders, pending items
- ✅ **Sales reports** - Date range filtering with COGS analysis
- ✅ **Order management** - View and update all orders
- ✅ **Product sync** - Force refresh from WooCommerce

---

## 📚 Documentation

- **[PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)** - Complete system documentation
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and changes
- **[PAYMENT_SETUP.md](./PAYMENT_SETUP.md)** - Payment gateway configuration
- **[RECEIPT_HTACCESS_INSTRUCTIONS.md](./RECEIPT_HTACCESS_INSTRUCTIONS.md)** - Receipt hosting setup

---

## 🛠️ Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** SQLite (better-sqlite3)
- **Styling:** Tailwind CSS
- **E-commerce:** WooCommerce REST API
- **File Upload:** FTP (node-ftp)
- **Icons:** Lucide React

---

## 📦 Project Structure

```
ren1/
├── app/                      # Next.js app router
│   ├── admin/               # Admin dashboard
│   ├── checkout/            # Checkout page
│   ├── kitchen/             # Kitchen display
│   ├── customer-display/    # Customer-facing display
│   └── api/                 # API routes
├── components/              # React components
├── context/                 # React context providers
├── lib/                     # Utilities and services
│   ├── db/                 # Database services
│   ├── api/                # API helpers
│   └── receiptGenerator.ts # Receipt HTML generation
├── prisma/                  # SQLite database
│   └── dev.db              # Local database (gitignored)
├── public/                  # Static assets
│   └── mascot.jpg          # Coffee Oasis logo
├── scripts/                 # Utility scripts
└── .env.local              # Environment variables (gitignored)
```

---

## ⚙️ Configuration

### Environment Variables

Create `.env.local` with:

```env
# WooCommerce API
NEXT_PUBLIC_WC_API_URL=https://coffee-oasis.com.my
WC_CONSUMER_KEY=ck_xxxxxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxxxxx

# FTP Receipt Upload
FTP_HOST=ftp.coffee-oasis.com.my
FTP_USER=your-username
FTP_PASSWORD=your-password
FTP_RECEIPT_PATH=/public_html/receipts
```

### Database

Database auto-creates at `./prisma/dev.db` on first run.

**Backup:**
```bash
cp prisma/dev.db prisma/backup-$(date +%Y%m%d).db
```

**Reset:**
```bash
rm prisma/dev.db && npm run start
```

---

## 🖥️ Multi-Screen Setup

### 1. Start POS Server
```bash
npm run build
npm run start
# Server on 0.0.0.0:3000
```

### 2. Find Server IP
```bash
# Linux/Mac
ip addr show | grep inet

# Windows
ipconfig
```

### 3. Connect Displays
- **POS:** `http://192.168.1.100:3000/admin`
- **Customer:** `http://192.168.1.100:3000/customer-display`
- **Kitchen:** `http://192.168.1.100:3000/kitchen`

---

## 🔧 Development

### Run Dev Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
npm run start
```

### Database Scripts
```bash
# View database stats
node scripts/verify-db-status.js

# Clean consumption records
node scripts/cleanup-consumption-only.js
```

---

## 📊 Production Status

**Version:** 1.0.0
**Status:** ✅ Production
**Last Deploy:** November 13, 2025

### Production Checklist
- [x] Environment configured
- [x] Database initialized
- [x] Mascot uploaded to Hostinger
- [x] FTP receipts working
- [x] WooCommerce sync active
- [x] All discounts functional
- [x] Kitchen display optimized
- [x] Build warnings resolved

---

## 🐛 Troubleshooting

### Orders Not Showing

**Issue:** New orders not appearing in admin/kitchen

**Solution:**
```bash
# Clear build cache and rebuild
rm -rf .next
npm run build
npm run start
```

### Receipt Upload Fails

**Issue:** FTP connection errors

**Solution:**
- Verify FTP credentials in `.env.local`
- Check Hostinger `/public_html/receipts/` folder exists
- Test FTP connection manually

### Database Errors

**Issue:** "Cannot open database because directory does not exist"

**Solution:**
```bash
# Create directory (auto-creates on next start)
mkdir -p prisma
touch prisma/.gitkeep
```

---

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

**Latest (v1.0.0):**
- Added 15% discount option
- Fixed build cache issues
- Removed receipt auto-open
- Optimized kitchen display layout
- Production database cleanup

---

## 🔒 Security

- ✅ Environment variables gitignored
- ✅ Database gitignored
- ✅ Admin authentication via sessionStorage
- ✅ HTTPS for WooCommerce API
- ✅ FTP credentials encrypted in env
- ✅ Regular database backups

---

## 📞 Support

**Website:** https://coffee-oasis.com.my
**Email:** support@coffee-oasis.com.my
**GitHub:** https://github.com/kayuwoody/ren1

---

## 📄 License

Private - All Rights Reserved

Copyright © 2025 Coffee Oasis

---

**Built with ❤️ for Coffee Oasis**
