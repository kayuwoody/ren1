import { useEffect } from 'react';
import { OrderEntry } from '@/lib/hooks/useOrderEntry';

/**
 * Merge cart items into an in-progress or new order.
 */
export function useOrderMerge(
  cartItems: { productId: number; name: string; price: number; quantity: number }[],
  callback: (order: OrderEntry) => void
) {
  useEffect(() => {
    if (cartItems.length === 0) return;

    const history: OrderEntry[] = JSON.parse(localStorage.getItem('ordersHistory') || '[]');
    let current = history.find(o => o.status === 'processing');

    if (!current) {
      const ts = Date.now();
      current = { id: String(ts), items: [], createdAt: ts, updatedAt: ts };
      history.unshift(current);
    }

    cartItems.forEach(ci => {
      const exist = current!.items.find(i => i.productId === ci.productId);
      if (exist) {
        exist.quantity += ci.quantity;
      } else {
        current!.items.push({ ...ci });
      }
    });

    current.updatedAt = Date.now();
    history[0] = current;
    localStorage.setItem('ordersHistory', JSON.stringify(history));
    callback(current);
  }, [cartItems, callback]);
}
