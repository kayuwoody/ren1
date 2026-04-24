import { supabase } from './supabase';

/**
 * Generates the next order number using a Postgres sequence.
 * Format: A1000, A1001, ...
 */
export async function nextOrderNumber(): Promise<string> {
  const { data, error } = await supabase.rpc('next_online_order_number');
  if (error) throw new Error(`Failed to generate order number: ${error.message}`);
  return `A${data}`;
}
