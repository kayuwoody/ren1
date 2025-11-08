import { wcApi } from '@/lib/wooClient';

/**
 * Fetches all pages from a WooCommerce API endpoint
 * Automatically handles pagination until all results are retrieved
 *
 * @param endpoint - WooCommerce API endpoint (e.g., 'orders', 'products', 'customers')
 * @param params - Query parameters to pass to the API (e.g., { status: 'completed', after: '2024-01-01' })
 * @param perPage - Number of items per page (default: 100, which is WooCommerce API max)
 * @returns Array of all items from all pages
 *
 * @example
 * // Fetch all orders for a date range
 * const orders = await fetchAllWooPages('orders', {
 *   after: startDate.toISOString(),
 *   before: endDate.toISOString(),
 *   orderby: 'date',
 *   order: 'desc'
 * });
 *
 * @example
 * // Fetch all products
 * const products = await fetchAllWooPages('products');
 *
 * @example
 * // Fetch all customers with search
 * const customers = await fetchAllWooPages('customers', { search: 'john' });
 */
export async function fetchAllWooPages<T = any>(
  endpoint: string,
  params: Record<string, any> = {},
  perPage: number = 100
): Promise<T[]> {
  const allItems: T[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data } = await wcApi.get(endpoint, {
      per_page: perPage,
      page,
      ...params,
    }) as { data: T[] };

    allItems.push(...data);

    // If we got fewer items than requested, we've reached the last page
    if (data.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allItems;
}

/**
 * Helper to extract metadata value from WooCommerce meta_data array
 *
 * @param metaData - The meta_data array from WooCommerce order/product
 * @param key - The meta key to find (e.g., '_final_total', '_discount_amount')
 * @param defaultValue - Default value if key not found (optional)
 * @returns The value or defaultValue if not found
 *
 * @example
 * const finalTotal = getMetaValue(order.meta_data, '_final_total', order.total);
 * const discount = getMetaValue(order.meta_data, '_total_discount', '0');
 */
export function getMetaValue(
  metaData: any[] | undefined,
  key: string,
  defaultValue?: any
): any {
  if (!metaData || !Array.isArray(metaData)) {
    return defaultValue;
  }

  const metaItem = metaData.find((m: any) => m.key === key);
  return metaItem?.value ?? defaultValue;
}
