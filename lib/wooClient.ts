import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { mockWcApi } from './mockWooClient';

// Use mock API if in development mode and USE_MOCK_API is set
const USE_MOCK = process.env.USE_MOCK_API === 'true';

// Lazy initialization to avoid SSR issues
let realWcApiInstance: any = null;

function getRealWcApi() {
  if (!realWcApiInstance) {
    const url = process.env.WC_API_URL || process.env.WC_STORE_URL;
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!url || !consumerKey || !consumerSecret) {
      console.warn('⚠️ WooCommerce credentials not configured. API calls will fail.');
      console.warn('   Required: WC_API_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET');
      // Return a dummy client that will throw helpful errors
      return {
        get: () => Promise.reject(new Error('WooCommerce credentials not configured')),
        post: () => Promise.reject(new Error('WooCommerce credentials not configured')),
        put: () => Promise.reject(new Error('WooCommerce credentials not configured')),
        delete: () => Promise.reject(new Error('WooCommerce credentials not configured')),
      };
    }

    realWcApiInstance = new WooCommerceRestApi({
      url,
      consumerKey,
      consumerSecret,
      version: 'wc/v3',
      queryStringAuth: true, // Force OAuth 1.0a (query parameters) instead of Basic Auth
    });

    // Enhanced logging (only once)
    const apiUrl = url || 'not set';
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 WooCommerce API Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: LIVE
Store URL: ${apiUrl}
Using: Real WooCommerce API with auto-retry
Retry: 3 attempts with exponential backoff (1s, 2s, 4s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  }

  return realWcApiInstance;
}

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
function wrapWithRetry(getApi: () => any) {
  return {
    get: (endpoint: string, params?: any) =>
      retryWithBackoff(() => getApi().get(endpoint, params)),
    post: (endpoint: string, data: any) =>
      retryWithBackoff(() => getApi().post(endpoint, data)),
    put: (endpoint: string, data: any) =>
      retryWithBackoff(() => getApi().put(endpoint, data)),
    delete: (endpoint: string) =>
      retryWithBackoff(() => getApi().delete(endpoint)),
  };
}

// Export either mock or real API based on environment, with retry wrapper
export const wcApi = USE_MOCK ? mockWcApi : wrapWithRetry(getRealWcApi);

if (USE_MOCK) {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 WooCommerce API Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: MOCK
USE_MOCK_API env: ${process.env.USE_MOCK_API}
Using: Mock responses (no real orders)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

