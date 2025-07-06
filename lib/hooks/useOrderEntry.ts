import { useState, useEffect } from 'react';

export interface CartItem { productId: number; name: string; price: number; quantity: number; }
export interface OrderEntry {
  id: string;
  wooId?: number;
  items: CartItem[];
  startTime?: number;
  endTime?: number;
  createdAt: number;
  updatedAt: number;
  meta_data?: { key: string; value: any }[];
  status?: string;
}

/**
 * Load and update the order entry by local ID or Woo ID.
 */
export function useOrderEntry(orderId: string) {
  const [entry, setEntry] = useState<OrderEntry | null | undefined>(undefined);

  useEffect(() => {
    const history: OrderEntry[] = JSON.parse(localStorage.getItem('ordersHistory') || '[]');
    let found = history.find(o => o.id === orderId) || null;
    if (!found) {
      const num = Number(orderId);
      if (!isNaN(num)) {
        found = history.find(o => o.wooId === num) || null;
      }
    }
    setEntry(found);
  }, [orderId]);

  const updateEntry = (updated: OrderEntry) => {
    setEntry(updated);
    const history: OrderEntry[] = JSON.parse(localStorage.getItem('ordersHistory') || '[]');
    const idx = history.findIndex(o => o.id === updated.id);
    if (idx > -1) history[idx] = updated;
    localStorage.setItem('ordersHistory', JSON.stringify(history));
  };

  return { entry, updateEntry };
}
