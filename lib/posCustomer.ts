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
    console.log(`🔍 Looking up POS customer: ${POS_CUSTOMER_EMAIL}`);

    const response: any = await wcApi.get('customers', {
      email: POS_CUSTOMER_EMAIL,
      per_page: 1
    });

    const customers = response.data || [];

    console.log(`   Found ${customers.length} customers matching email`);

    if (customers.length > 0) {
      console.log(`   Customer details:`, JSON.stringify({
        id: customers[0].id,
        email: customers[0].email,
        first_name: customers[0].first_name,
        last_name: customers[0].last_name
      }));
    }

    if (customers.length === 0) {
      // Try searching all customers to see if email is slightly different
      console.log('⚠️ Email search failed, fetching all customers to debug...');
      const allResponse: any = await wcApi.get('customers', { per_page: 20 });
      const allCustomers = allResponse.data || [];
      console.log(`   Total customers: ${allCustomers.length}`);
      allCustomers.forEach((c: any) => {
        console.log(`   - ID ${c.id}: ${c.email} (${c.first_name} ${c.last_name})`);
      });

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
