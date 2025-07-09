// 1. lib/orderService.ts import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { getClientId } from '@/lib/getClientId';

// Initialize the WooCommerce REST client
const api = new WooCommerceRestApi({
  url: process.env.WC_STORE_URL!,
  consumerKey: process.env.WC_CONSUMER_KEY!,
  consumerSecret: process.env.WC_CONSUMER_SECRET!,
  version: 'wc/v3',
});

if (!process.env.WC_STORE_URL || !process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
  console.warn("⚠️ Missing WooCommerce credentials in environment variables.");
}
/**
 * Create a new WooCommerce order
 */
export async function createWooOrder(payload: any) {
  console.log("🚨 Incoming payload to createWooOrder:", JSON.stringify(payload, null, 2));

  const { clientId, ...rest } = payload;

  const fullPayload = {
    ...rest,
    meta_data: [
      ...(payload.meta_data || []),
      {
        key: 'clientId',
        value: clientId,
      },
    ],
  };

  const { data } = await api.post('orders', fullPayload);
  return data;
}

/**
 * Update an existing WooCommerce order by ID
 */
export async function updateWooOrder(id: number | string, payload: any) {
  const endpoint = `orders/${id}`;
  const { data } = await api.put(endpoint, payload);
  return data;
}

/**
 * Find a processing order for a specific clientId
 */
export async function findProcessingOrder(clientId: string) {
  const { data } = await api.get('orders', {
    status: 'processing',
    meta_key: 'clientId',
    meta_value: clientId,
    per_page: 1,
  });
  return Array.isArray(data) ? data[0] || null : null;
}

/**
 * List all WooCommerce orders (up to 100)
 */
export async function listWooOrders(clientId: string) {
  const { data } = await api.get('orders');

  // Defensive filter: match meta_data key (case-insensitive) and value
  const filtered = data.filter((order: any) =>
    (order.meta_data || []).some((m: any) =>
      typeof m.key === 'string' &&
      m.key.toLowerCase() === 'clientid' &&
      String(m.value).toLowerCase() === clientId.toLowerCase()
    )
  );

  return filtered;
}

/**
 * Get a single WooCommerce order by ID
 */
export async function getWooOrder(id: number | string) {
  const endpoint = `orders/${id}`;
  try {
    console.log(`📦 Calling WooCommerce GET ${endpoint}`);
    const { data } = await api.get(endpoint);
    console.log(`✅ WooCommerce order #${id} received`);
    return data;
  } catch (err: any) {
    console.error(`❌ Failed to fetch WooCommerce order ${id}:`, err?.response?.data || err.message || err);
    throw err; // rethrow so API route can respond with 500
  }
}
