# Coffee Oasis POS - Production Deployment Guide

**Version:** 1.0.0
**Last Updated:** November 13, 2025
**Status:** ✅ Production Ready

---

## Prerequisites

Before deploying to production, ensure you have:

- [ ] **Node.js 18+** installed on production machine
- [ ] **WooCommerce store** configured at https://coffee-oasis.com.my
- [ ] **WooCommerce API keys** (Consumer Key & Secret)
- [ ] **Hostinger FTP credentials** for receipt uploads
- [ ] **Local network** configured for multi-screen displays (if using)
- [ ] **Coffee Oasis mascot** (mascot.jpg) file ready

---

## Step-by-Step Deployment

### 1. Clone Repository

```bash
git clone https://github.com/kayuwoody/ren1.git
cd ren1
```

### 2. Configure Environment Variables

```bash
# Copy environment template
cp .env.local.example .env.local

# Edit with your credentials
nano .env.local
```

**Required Variables:**
```env
# WooCommerce API
NEXT_PUBLIC_WC_API_URL=https://coffee-oasis.com.my
WC_CONSUMER_KEY=ck_xxxxxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxxxxx

# FTP for Receipt Upload
FTP_HOST=ftp.coffee-oasis.com.my
FTP_USER=your-ftp-username
FTP_PASSWORD=your-ftp-password
FTP_RECEIPT_PATH=/public_html/receipts

# Admin Authentication (optional)
ADMIN_PASSWORD=your-secure-password
```

### 3. Install Dependencies

```bash
npm install
```

**Expected output:**
```
added 250 packages in 15s
```

### 4. Build for Production

```bash
npm run build
```

**⚠️ CRITICAL:** Always rebuild after pulling changes. Build cache can cause stale data issues.

**Expected output:**
```
✓ Compiled successfully
✓ Collecting page data
✓ Generating static pages (75/75)
✓ Finalizing page optimization

Route (app)                              Size     First Load JS
┌ ○ /                                    5.2 kB         100 kB
├ ○ /admin                               8.1 kB         110 kB
├ ○ /checkout                            12 kB          115 kB
├ ○ /kitchen                             15 kB          120 kB
└ ...
```

### 5. Start Production Server

```bash
npm run start
```

**Server will start on:**
- Local: http://localhost:3000
- Network: http://0.0.0.0:3000

### 6. Upload Mascot to Hostinger

**Via FTP:**
1. Connect to `ftp.coffee-oasis.com.my`
2. Navigate to `public_html/receipts/`
3. Upload `public/mascot.jpg`
4. Verify: https://coffee-oasis.com.my/receipts/mascot.jpg

**Via cPanel File Manager:**
1. Login to Hostinger cPanel
2. Navigate to File Manager → `public_html/receipts/`
3. Upload `mascot.jpg`
4. Set permissions to 644

### 7. Initialize Database

The database auto-creates on first API call:

```bash
# Database location
./prisma/dev.db

# Verify database created
ls -lh prisma/dev.db
# Expected: 450-500 KB file
```

**Database starts with:**
- ✅ 0 consumption records (fresh for production)
- ✅ Products synced from WooCommerce
- ✅ Recipe items preserved
- ✅ Purchase order history (if any)

### 8. Production Verification

**Test Checklist:**

```bash
# 1. Admin Login
curl http://localhost:3000/admin
# Should show login page

# 2. Product Sync
curl http://localhost:3000/api/products
# Should return product list

# 3. WooCommerce Connection
curl http://localhost:3000/api/admin/orders
# Should return order list (or empty array)

# 4. Database Tables
sqlite3 prisma/dev.db ".tables"
# Should show: Product, Material, ProductRecipe, etc.

# 5. Receipt Test (after first order)
curl http://localhost:3000/api/receipts/generate -X POST \
  -H "Content-Type: application/json" \
  -d '{"orderId": 123}'
# Should upload to Hostinger
```

### 9. Multi-Screen Setup (Optional)

**Find Server IP:**
```bash
# Linux/Mac
ip addr show | grep inet

# Windows
ipconfig

# Example: 192.168.1.100
```

**Connect Displays:**
```
POS:              http://192.168.1.100:3000/admin
Customer Display: http://192.168.1.100:3000/customer-display
Kitchen Display:  http://192.168.1.100:3000/kitchen
```

**Display Settings:**
- Set to fullscreen/kiosk mode
- Disable sleep/screensaver
- Kitchen: Landscape orientation
- Customer: Portrait orientation

---

## Production Monitoring

### Health Checks

**Check Server Status:**
```bash
# Server process
ps aux | grep node

# Port listening
netstat -tuln | grep 3000

# Logs
tail -f logs/app.log  # If logging configured
```

### Database Monitoring

**View Database Stats:**
```bash
sqlite3 prisma/dev.db "
  SELECT
    (SELECT COUNT(*) FROM Product) as products,
    (SELECT COUNT(*) FROM InventoryConsumption) as consumptions,
    (SELECT COUNT(*) FROM ProductRecipe) as recipes,
    (SELECT COUNT(*) FROM PurchaseOrder) as purchase_orders;
"
```

### Receipt Verification

**Check Latest Receipts:**
```bash
# Via FTP
ls -lht /public_html/receipts/*.html | head -5

# Via web
curl -I https://coffee-oasis.com.my/receipts/receipt-[orderId].html
```

---

## Troubleshooting

### Issue: Orders Not Showing in Kitchen/Admin

**Cause:** Next.js build cache serving stale data

**Solution:**
```bash
# 1. Stop server
pkill node

# 2. Clear build cache
rm -rf .next

# 3. Rebuild
npm run build

# 4. Restart
npm run start
```

### Issue: Database Directory Not Found

**Cause:** Fresh installation, prisma directory missing

**Solution:**
```bash
# Auto-creates on server start
# Or manually:
mkdir -p prisma
touch prisma/.gitkeep
```

### Issue: Receipt Upload Fails

**Cause:** FTP credentials incorrect or path wrong

**Solution:**
```bash
# Test FTP connection
ftp ftp.coffee-oasis.com.my
# Enter credentials manually

# Check FTP path
cd /public_html/receipts
ls

# Verify write permissions
```

### Issue: Products Not Syncing

**Cause:** WooCommerce API credentials invalid

**Solution:**
```bash
# Test API manually
curl -u "ck_xxx:cs_xxx" \
  https://coffee-oasis.com.my/wp-json/wc/v3/products

# Regenerate API keys in WooCommerce if needed
```

---

## Rollback Procedure

If something goes wrong:

```bash
# 1. Stop server
pkill node

# 2. Checkout previous version
git log --oneline | head -5  # Find working commit
git checkout <commit-hash>

# 3. Rebuild
npm install
npm run build

# 4. Restore database backup (if needed)
cp prisma/backup-20251113.db prisma/dev.db

# 5. Restart
npm run start
```

---

## Maintenance

### Daily
- ✅ Check server is running
- ✅ Verify kitchen display working
- ✅ Monitor disk space (receipts accumulate)

### Weekly
- ✅ Backup database
- ✅ Review error logs
- ✅ Test receipt generation

### Monthly
- ✅ Update dependencies (`npm update`)
- ✅ Clean old receipts (older than 30 days)
- ✅ Review and optimize database

---

## Security Checklist

Production security measures:

- [ ] Environment variables in `.env.local` (NOT committed)
- [ ] Admin password set in sessionStorage
- [ ] FTP credentials encrypted in environment
- [ ] Database file NOT in git (`.gitignore`)
- [ ] HTTPS enabled on WooCommerce API
- [ ] Regular database backups
- [ ] Server firewall configured
- [ ] SSH key authentication (if remote)

---

## Support

**Documentation:**
- `PROJECT_DOCUMENTATION.md` - Full system documentation
- `CHANGELOG.md` - Version history and changes
- `PAYMENT_SETUP.md` - Payment gateway configuration
- `RECEIPT_HTACCESS_INSTRUCTIONS.md` - Receipt hosting setup

**Debugging:**
```bash
# Enable debug mode
DEBUG=* npm run start

# Check build logs
npm run build 2>&1 | tee build.log

# Database explorer
sqlite3 prisma/dev.db
```

**Contact:**
- Email: support@coffee-oasis.com.my
- GitHub Issues: https://github.com/kayuwoody/ren1/issues

---

## Production Checklist

Final verification before going live:

- [ ] `npm run build` completes successfully
- [ ] Environment variables configured
- [ ] Database initialized
- [ ] Mascot uploaded to Hostinger
- [ ] FTP uploads working
- [ ] Test order processed successfully
- [ ] Receipt generated and accessible
- [ ] Admin login working
- [ ] Kitchen display receiving orders
- [ ] WooCommerce sync active
- [ ] All discount options working (10%, 15%, 20%, 25%, 50%, 🦄Free)
- [ ] Multi-screen displays connected (if using)
- [ ] Backup procedure tested
- [ ] Rollback procedure documented

**Deployment Status:** 🟢 Ready for Production v1.0

---

**Last Deploy:** November 13, 2025
**Next Review:** December 13, 2025
