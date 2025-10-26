import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { mockWcApi } from './mockWooClient';

// Use mock API if in development mode and USE_MOCK_API is set
const USE_MOCK = process.env.USE_MOCK_API === 'true';

const realWcApi = new WooCommerceRestApi({
  url: process.env.WC_STORE_URL!,
  consumerKey: process.env.WC_CONSUMER_KEY!,
  consumerSecret: process.env.WC_CONSUMER_SECRET!,
  version: 'wc/v3',
  queryStringAuth: true, // Force OAuth 1.0a (query parameters) instead of Basic Auth
});

/**
 * Retry helper with exponential backoff
 * Handles transient network errors from Cloudflare/firewalls
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a network error worth retrying
      const isNetworkError =
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.message?.includes('socket hang up') ||
        error.message?.includes('network') ||
        (error.response?.status >= 500 && error.response?.status < 600); // Server errors

      if (!isNetworkError || attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`⚠️ WooCommerce API error (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message || error.code}`);
      console.warn(`   Retrying in ${delay}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Wrap WooCommerce API with retry logic
 */
function wrapWithRetry(api: any) {
  return {
    get: (endpoint: string, params?: any) =>
      retryWithBackoff(() => api.get(endpoint, params)),
    post: (endpoint: string, data: any) =>
      retryWithBackoff(() => api.post(endpoint, data)),
    put: (endpoint: string, data: any) =>
      retryWithBackoff(() => api.put(endpoint, data)),
    delete: (endpoint: string) =>
      retryWithBackoff(() => api.delete(endpoint)),
  };
}

// Export either mock or real API based on environment, with retry wrapper
export const wcApi = USE_MOCK ? mockWcApi : wrapWithRetry(realWcApi);

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
Using: ${USE_MOCK ? 'Mock responses (no real orders)' : 'Real WooCommerce API with auto-retry'}
Retry: ${USE_MOCK ? 'N/A' : '3 attempts with exponential backoff (1s, 2s, 4s)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

