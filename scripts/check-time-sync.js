#!/usr/bin/env node

/**
 * Check time synchronization between local server and WooCommerce
 *
 * WooCommerce uses OAuth 1.0a which requires timestamps to be synchronized
 * If times are off by more than 5 minutes, requests will fail
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
}

console.log('\n🕐 Time Synchronization Check\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 1. Check local server time
const localTime = new Date();
console.log(`📍 Local Server Time:`);
console.log(`   ${localTime.toISOString()}`);
console.log(`   ${localTime.toString()}`);
console.log(`   Unix timestamp: ${Math.floor(localTime.getTime() / 1000)}\n`);

// 2. Check WooCommerce server time
const wooUrl = process.env.WC_STORE_URL;
if (!wooUrl) {
  console.error('❌ WC_STORE_URL not set in environment variables');
  process.exit(1);
}

const domain = new URL(wooUrl).hostname;

console.log(`🌐 Checking WooCommerce server time...`);
console.log(`   Domain: ${domain}\n`);

https.get(`https://${domain}`, (res) => {
  const serverDate = res.headers['date'];

  if (!serverDate) {
    console.error('❌ No Date header received from server');
    process.exit(1);
  }

  const wooTime = new Date(serverDate);
  console.log(`🛒 WooCommerce Server Time:`);
  console.log(`   ${wooTime.toISOString()}`);
  console.log(`   ${wooTime.toString()}`);
  console.log(`   Unix timestamp: ${Math.floor(wooTime.getTime() / 1000)}\n`);

  // 3. Calculate difference
  const diffMs = Math.abs(localTime.getTime() - wooTime.getTime());
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);

  console.log(`⏱️  Time Difference:`);
  console.log(`   ${diffSeconds} seconds (${diffMinutes} minutes)\n`);

  // 4. Check if within acceptable range
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (diffSeconds < 60) {
    console.log('✅ PASS: Times are synchronized (< 1 minute difference)');
    console.log('   OAuth authentication should work fine.\n');
  } else if (diffSeconds < 300) {
    console.log('⚠️  WARNING: Times differ by more than 1 minute');
    console.log('   This may cause intermittent authentication issues.\n');
    console.log('   Recommendation: Sync your server time with NTP');
  } else {
    console.log('❌ FAIL: Times differ by more than 5 minutes!');
    console.log('   OAuth authentication will likely fail.\n');
    console.log('   FIX: Sync your server time immediately:');
    console.log('   • On Linux: sudo ntpdate -s time.nist.gov');
    console.log('   • On Codespaces: Contact GitHub support');
    console.log('   • On Docker: Restart container\n');
  }

  // 5. Show timezone info
  console.log('🌍 Timezone Information:');
  console.log(`   Local TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log(`   Local offset: UTC${localTime.getTimezoneOffset() > 0 ? '-' : '+'}${Math.abs(localTime.getTimezoneOffset() / 60)}\n`);

}).on('error', (err) => {
  console.error('❌ Failed to connect to WooCommerce server:', err.message);
  process.exit(1);
});
