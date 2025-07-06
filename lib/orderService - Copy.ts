// lib/orderService.ts
// import fetch from 'node-fetch';
// lib/orderService.ts

// First try the “official” store URL vars, then fall back to NEXT_PUBLIC_WC_API_URL
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

const storeUrl =
  process.env.WC_STORE_URL ||
  process.env.NEXT_PUBLIC_WC_STORE_URL ||
  process.env.NEXT_PUBLIC_WC_API_URL;
const consumerKey =
  process.env.WC_CONSUMER_KEY ||
  process.env.NEXT_PUBLIC_WC_CONSUMER_KEY;
const consumerSecret =
  process.env.WC_CONSUMER_SECRET ||
  process.env.NEXT_PUBLIC_WC_CONSUMER_SECRET;

const api = new WooCommerceRestApi({
  url:           process.env.NEXT_PUBLIC_WC_API_URL!,
  consumerKey:    process.env.NEXT_PUBLIC_WC_CONSUMER_KEY!,
  consumerSecret: process.env.NEXT_PUBLIC_WC_CONSUMER_SECRET!,
  version:       'wc/v3',
});

if (!storeUrl || !consumerKey || !consumerSecret) {
  console.error(
    '🐛 WC_STORE_URL:',
    process.env.WC_STORE_URL,
    'NEXT_PUBLIC_WC_STORE_URL:',
    process.env.NEXT_PUBLIC_WC_STORE_URL,
    'NEXT_PUBLIC_WC_API_URL:',
    process.env.NEXT_PUBLIC_WC_API_URL,
    'KEY:',
    process.env.WC_CONSUMER_KEY,
    'SECRET:',
    process.env.WC_CONSUMER_SECRET
  );
  throw new Error(
    'WooCommerce credentials are not fully configured in environment variables.'
  );
}
console.log('🐛 NEXT_PUBLIC_WC_API_URL:', process.env.NEXT_PUBLIC_WC_API_URL);
console.log('🐛 NEXT_PUBLIC_WC_STORE_URL:', process.env.NEXT_PUBLIC_WC_STORE_URL);
// Add this at the top of lib/orderService.ts, before the if-guard
console.log('🐛 ENV storeUrl        =', storeUrl);
console.log('🐛 ENV WC_CONSUMER_KEY =', process.env.WC_CONSUMER_KEY);
console.log('🐛 ENV NEXT_PUBLIC_WC_CONSUMER_KEY =', process.env.NEXT_PUBLIC_WC_CONSUMER_KEY);
console.log('🐛 ENV consumerKey     =', consumerKey);
console.log('🐛 ENV WC_CONSUMER_SECRET =', process.env.WC_CONSUMER_SECRET);
console.log('🐛 ENV NEXT_PUBLIC_WC_CONSUMER_SECRET =', process.env.NEXT_PUBLIC_WC_CONSUMER_SECRET);
console.log('🐛 ENV consumerSecret  =', consumerSecret);
if (!storeUrl || !consumerKey || !consumerSecret) {
  throw new Error('WooCommerce credentials are not fully configured in environment variables.');
}

// Helper to build authenticated URL
function wcUrl(path: string): string {
  const url = new URL(path, storeUrl);
  url.searchParams.append('consumer_key', consumerKey);
  url.searchParams.append('consumer_secret', consumerSecret);
  return url.toString();
}

export interface LineItem {
  product_id: number;
  quantity: number;
}

export interface CreateOrderPayload {
  customer_id?: number;
  payment_method?: string;
  payment_method_title?: string;
  set_paid?: boolean;
  billing?: Record<string, any>;
  shipping?: Record<string, any>;
  line_items: LineItem[];
  meta_data?: { key: string; value: any }[];
}

export interface WooOrderResponse {
  id: number;
  status: string;
  meta_data: { key: string; value: any }[];
}

/**
 * Create a new WooCommerce order.
 */
export async function createWooOrder(payload: CreateOrderPayload): Promise<WooOrderResponse> {
  const url = wcUrl('/wp-json/wc/v3/orders');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Woo create order failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/**
 * Update an existing WooCommerce order's status.
 */
export async function updateWooOrder(
  orderId: number,
  payload: { status?: string; line_items?: LineItem[] }
): Promise<WooOrderResponse> {
  const url = wcUrl(`/wp-json/wc/v3/orders/${orderId}`);
  const body: any = {};
  if (payload.status) body.status = payload.status;
  if (payload.line_items) body.line_items = payload.line_items;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Woo update order failed: ${res.status} ${txt}`);
  }
  return res.json();
}
// lib/orderService.ts (add at bottom)
export async function listWooOrders() {
  const resp = await api.get('orders', {
    per_page: 20,
    order:    'desc',
    orderby:  'date',
  });
  return resp.data;
}

