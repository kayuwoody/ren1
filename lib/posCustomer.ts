import { wcApi } from './wooClient';

const POS_CUSTOMER_EMAIL = 'pos-admin@coffee-oasis.com.my';

// Cache the customer ID to avoid repeated API calls
let cachedPosCustomerId: number | null = null;

/**
 * Get the POS customer ID from WooCommerce
 * Uses cached value if available, otherwise fetches from API
 */
export async function getPosCustomerId(): Promise<number> {
  // Return cached value if available
  if (cachedPosCustomerId !== null) {
    return cachedPosCustomerId;
  }

  try {
    // Search for customer by email
    const response: any = await wcApi.get('customers', {
      email: POS_CUSTOMER_EMAIL,
      per_page: 1
    });

    const customers = response.data || [];

    if (customers.length === 0) {
      throw new Error(`POS customer not found with email: ${POS_CUSTOMER_EMAIL}`);
    }

    const posCustomer = customers[0];
    cachedPosCustomerId = posCustomer.id;

    console.log(`✅ POS customer found: ID ${cachedPosCustomerId} (${POS_CUSTOMER_EMAIL})`);

    return cachedPosCustomerId;
  } catch (err: any) {
    console.error('❌ Failed to fetch POS customer:', err);
    throw new Error(`Could not find POS customer: ${err.message}`);
  }
}

/**
 * Clear the cached customer ID (useful for testing or if customer gets recreated)
 */
export function clearPosCustomerCache() {
  cachedPosCustomerId = null;
}
