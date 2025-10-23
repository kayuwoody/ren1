import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { mockWcApi } from './mockWooClient';

// Use mock API if in development mode and USE_MOCK_API is set
const USE_MOCK = process.env.USE_MOCK_API === 'true';

const realWcApi = new WooCommerceRestApi({
  url: process.env.WC_STORE_URL!,
  consumerKey: process.env.WC_CONSUMER_KEY!,
  consumerSecret: process.env.WC_CONSUMER_SECRET!,
  version: 'wc/v3',
});

// Export either mock or real API based on environment
export const wcApi = USE_MOCK ? mockWcApi : realWcApi;

// Enhanced logging
const apiMode = USE_MOCK ? 'MOCK' : 'LIVE';
const apiUrl = process.env.WC_STORE_URL || 'not set';
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 WooCommerce API Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: ${apiMode}
USE_MOCK_API env: ${process.env.USE_MOCK_API}
Store URL: ${apiUrl}
Using: ${USE_MOCK ? 'Mock responses (no real orders)' : 'Real WooCommerce API'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
