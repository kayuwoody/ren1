import { supabase } from './supabase';

export async function nextOrderNumber(): Promise<string> {
  const { data, error } = await supabase.rpc('next_online_order_number');
  if (error) throw new Error(`Failed to generate order number: ${error.message}`);
  return `A${data}`;
}
