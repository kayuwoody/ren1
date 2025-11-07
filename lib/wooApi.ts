import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

// Lazy initialization to avoid SSR issues
let wooInstance: any = null;

function getWooApi() {
  if (!wooInstance) {
    const url = process.env.NEXT_PUBLIC_WC_URL || process.env.WC_API_URL;
    const consumerKey = process.env.NEXT_PUBLIC_WC_CONSUMER_KEY || process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.NEXT_PUBLIC_WC_CONSUMER_SECRET || process.env.WC_CONSUMER_SECRET;

    if (!url || !consumerKey || !consumerSecret) {
      console.warn('⚠️ WooCommerce credentials not configured (wooApi). API calls will fail.');
      // Return dummy client that will throw helpful errors
      return {
        get: () => Promise.reject(new Error('WooCommerce credentials not configured')),
        post: () => Promise.reject(new Error('WooCommerce credentials not configured')),
        put: () => Promise.reject(new Error('WooCommerce credentials not configured')),
        delete: () => Promise.reject(new Error('WooCommerce credentials not configured')),
      };
    }

    wooInstance = new WooCommerceRestApi({
      url,
      consumerKey,
      consumerSecret,
      version: "wc/v3",
    });
  }

  return wooInstance;
}

// Export a proxy that lazily initializes on first use
const api = new Proxy({} as any, {
  get: (_target, prop) => {
    const woo = getWooApi();
    return woo[prop];
  }
});

export default api;
