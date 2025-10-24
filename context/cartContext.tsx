'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  syncWithPendingOrder: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load pending order items on mount
  useEffect(() => {
    const loadPendingOrder = async () => {
      const pendingOrderId = localStorage.getItem('pendingOrderId');
      if (!pendingOrderId) {
        setIsLoaded(true);
        return;
      }

      try {
        const res = await fetch(`/api/orders/${pendingOrderId}`);
        if (!res.ok) {
          // Order doesn't exist, clear it
          localStorage.removeItem('pendingOrderId');
          setIsLoaded(true);
          return;
        }

        const order = await res.json();

        // Only load if still pending
        if (order.status === 'pending') {
          // Convert WooCommerce line_items to CartItem format
          const items: CartItem[] = order.line_items.map((item: any) => ({
            productId: item.product_id,
            name: item.name,
            price: parseFloat(item.price),
            quantity: item.quantity
          }));

          setCartItems(items);
          console.log('🛒 Loaded pending order items into cart:', items);
        } else {
          // Order was paid, clear it
          localStorage.removeItem('pendingOrderId');
        }
      } catch (err) {
        console.error('Failed to load pending order:', err);
      }

      setIsLoaded(true);
    };

    loadPendingOrder();
  }, []);

  // Sync cart changes to pending order
  const syncWithPendingOrder = async () => {
    const pendingOrderId = localStorage.getItem('pendingOrderId');
    if (!pendingOrderId || !isLoaded) return;

    try {
      const lineItems = cartItems.map(item => ({
        product_id: item.productId,
        quantity: item.quantity
      }));

      await fetch(`/api/orders/${pendingOrderId}/update-items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items: lineItems })
      });

      console.log('🔄 Synced cart with pending order');
    } catch (err) {
      console.error('Failed to sync with pending order:', err);
    }
  };

  // Auto-sync when cart changes (debounced)
  useEffect(() => {
    if (!isLoaded) return;

    const timeout = setTimeout(() => {
      syncWithPendingOrder();
    }, 500); // 500ms debounce

    return () => clearTimeout(timeout);
  }, [cartItems, isLoaded]);

  const addToCart = (item: CartItem) => {
    setCartItems(prev => {
      const existing = prev.find(ci => ci.productId === item.productId);
      if (existing) {
        return prev.map(ci =>
          ci.productId === item.productId
            ? { ...ci, quantity: ci.quantity + item.quantity }
            : ci
        );
      } else {
        return [...prev, item];
      }
    });
  };

  const removeFromCart = (productId: number) => {
    setCartItems(prev => prev.filter(ci => ci.productId !== productId));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  return (
    <CartContext.Provider value={{ cartItems, addToCart, removeFromCart, clearCart, syncWithPendingOrder }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
