// lib/customerService.ts
import api from './wooApi';
import { v4 as uuidv4 } from 'uuid';

export async function createOrFindWooCustomer({ name, email, phone, address }: {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}): Promise<{ clientId: string; wooCustomerId: number }> {
  const clientId = uuidv4();

  // Try to find an existing customer
  const queryParam = email ? `email=${email}` : `role=all&search=${phone}`;
  const { data: existing } = await api.get(`customers?${queryParam}`);

  if (existing && existing.length > 0) {
    const customer = existing[0];
    return { clientId, wooCustomerId: customer.id };
  }

  // If not found, create new WooCommerce customer
  const payload: any = {
    email: email || `${uuidv4()}@placeholder.email`,
    first_name: name || '',
    billing: {
      address_1: address || '',
      phone: phone || '',
    },
    meta_data: [
      { key: 'clientId', value: clientId },
    ],
  };

  const { data: newCustomer } = await api.post('customers', payload);
  return { clientId, wooCustomerId: newCustomer.id };
}
