# Changelog

All notable changes to Coffee Oasis POS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Timezone handling** - Admin dashboard daily stats now correctly use Malaysia time (UTC+8) instead of system/UTC time
- **Date boundaries** - Today's orders/revenue calculated using Malaysian day boundaries (00:00-23:59 UTC+8)

### Added
- **Timezone documentation** - Added implementation pattern and affected areas to PROJECT_DOCUMENTATION.md

## [1.0.0] - 2025-11-13 - Production v1.0

### Added
- **15% discount option** to checkout quick discount buttons
- **Production deployment documentation** in PROJECT_DOCUMENTATION.md
- **Database auto-creation** - `prisma/` directory created automatically if missing
- **Dynamic API route exports** to prevent Next.js build cache issues
- **CHANGELOG.md** for tracking all version changes

### Changed
- **Receipt system**: Removed auto-open popup after payment
- **Receipt QR code**: Removed outdated localhost QR code from internal receipt page
- **Discount button order**: Reordered to 10%, 15%, 20%, 25%, 50%, 100%
- **Kitchen display layout**: Single orders now max 450px width (prevents full-screen expansion)
- **Viewport configuration**: Moved `themeColor` to viewport export (Next.js 14+ compliance)
- **100% discount tagging**: Only 100% off tagged as "Unicorns", 25% is regular discount

### Fixed
- **Admin orders endpoint**: Added `export const dynamic = 'force-dynamic'` to prevent stale cached data
- **Kitchen orders endpoint**: Added dynamic export for real-time order updates
- **Build warnings**: Fixed 6 API routes with missing dynamic exports
- **Database initialization**: Fixed "directory does not exist" error on fresh installations
- **priceAdjustment property**: Removed from ProductRecipeItem interface (was overengineered)

### Removed
- **priceAdjustment column** from ProductRecipe table schema
- **QRCode component** from internal receipt page
- **Auto-open receipt** popup behavior after payment
- **Base64 image embedding** code (unused, used relative path instead)

### Database
- **Production cleanup**: Cleared all consumption records (551 records) for fresh production start
- **Database preservation**: Added `prisma/.gitkeep` to maintain directory structure in git
- **Git tracking**: Removed `dev.db` from git tracking while preserving local files

### Performance
- **Dynamic rendering**: All order/sales/customer API endpoints now force dynamic rendering
- **Cache busters**: Added `_: Date.now()` to WooCommerce API calls for fresh data
- **Build optimization**: Fixed Next.js static generation warnings

## [Pre-1.0.0] - Development Phase

### Major Features Implemented
- Multi-screen POS system (POS, Customer Display, Kitchen Display)
- Hold order system with auto-generated tags
- COGS & inventory management with recipe builder
- Advanced discount system (percent, amount, override)
- Static HTML receipt generation with FTP upload
- WooCommerce integration for products and orders
- SQLite database with better-sqlite3
- Admin dashboard with operational stats
- Kitchen timer and order management
- Bundle products with XOR ingredient groups
- Material database for inventory tracking
- Automatic stock deduction on orders

---

## Version History

- **1.0.0** (2025-11-13) - Production v1.0 Release
- **0.x.x** (2025-10 to 2025-11) - Development and testing phase
