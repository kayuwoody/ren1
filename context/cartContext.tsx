'use client';
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

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
  const skipNextSyncRef = useRef(false);

  // Load pending order items on mount
  useEffect(() => {
    const loadPendingOrder = async () => {
      const pendingOrderId = localStorage.getItem('pendingOrderId');
      console.log('🛒 CartContext mount - pendingOrderId:', pendingOrderId);

      if (!pendingOrderId) {
        console.log('🛒 No pending order, starting with empty cart');
        setIsLoaded(true);
        return;
      }

      console.log(`🛒 Fetching pending order #${pendingOrderId}...`);
      try {
        const res = await fetch(`/api/orders/${pendingOrderId}`);
        if (!res.ok) {
          console.warn(`🛒 Order #${pendingOrderId} not found, clearing pendingOrderId`);
          localStorage.removeItem('pendingOrderId');
          setIsLoaded(true);
          return;
        }

        const order = await res.json();
        console.log(`🛒 Fetched order #${pendingOrderId}, status: ${order.status}, items:`, order.line_items);

        // Only load if still pending
        if (order.status === 'pending') {
          // Convert WooCommerce line_items to CartItem format
          const items: CartItem[] = order.line_items.map((item: any) => ({
            productId: item.product_id,
            name: item.name,
            price: parseFloat(item.price),
            quantity: item.quantity
          }));

          // Skip the next sync since we're loading FROM backend
          skipNextSyncRef.current = true;
          setCartItems(items);
          console.log('✅ Loaded pending order items into cart:', items);
        } else {
          console.log(`🛒 Order #${pendingOrderId} is ${order.status}, not loading items`);
          localStorage.removeItem('pendingOrderId');
        }
      } catch (err) {
        console.error('❌ Failed to load pending order:', err);
      }

      setIsLoaded(true);
    };

    loadPendingOrder();
  }, []);

  // Sync cart changes to pending order (or create one if needed)
  const syncWithPendingOrder = async () => {
    if (!isLoaded) return;

    // Don't sync empty carts to prevent accidental deletion
    if (cartItems.length === 0) {
      console.log('🛒 Skipping sync - cart is empty');
      return;
    }

    let pendingOrderId = localStorage.getItem('pendingOrderId');

    // If no pending order exists, create one
    if (!pendingOrderId) {
      console.log('🆕 No pending order found, creating one...');
      try {
        const userIdStr = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;
        const userId = userIdStr ? Number(userIdStr) : undefined;

        const lineItems = cartItems.map(item => ({
          product_id: item.productId,
          quantity: item.quantity
        }));

        const payload: any = {
          line_items: lineItems,
          ...(userId ? { userId } : {})
        };

        const res = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          console.error('❌ Failed to create pending order');
          return;
        }

        const newOrder = await res.json();
        pendingOrderId = String(newOrder.id);
        localStorage.setItem('pendingOrderId', pendingOrderId);
        console.log(`✅ Created pending order #${pendingOrderId}`);
        return;
      } catch (err) {
        console.error('❌ Failed to create pending order:', err);
        return;
      }
    }

    // Update existing pending order
    try {
      const lineItems = cartItems.map(item => ({
        product_id: item.productId,
        quantity: item.quantity
      }));

      console.log(`🔄 Syncing ${cartItems.length} items to pending order #${pendingOrderId}...`);

      await fetch(`/api/orders/${pendingOrderId}/update-items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items: lineItems })
      });

      console.log('✅ Synced cart with pending order');
    } catch (err) {
      console.error('❌ Failed to sync with pending order:', err);
    }
  };

  // Auto-sync when cart changes (debounced)
  useEffect(() => {
    if (!isLoaded) return;

    // Skip sync if we just loaded from backend
    if (skipNextSyncRef.current) {
      console.log('⏭️ Skipping sync - cart was just loaded from backend');
      skipNextSyncRef.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      syncWithPendingOrder();
    }, 500); // 500ms debounce

    return () => clearTimeout(timeout);
  }, [cartItems, isLoaded]);

  const addToCart = (item: CartItem) => {
    console.log('➕ Adding to cart:', item);
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
    console.log('➖ Removing from cart:', productId);
    setCartItems(prev => prev.filter(ci => ci.productId !== productId));
  };

  const clearCart = () => {
    console.log('🗑️ Clearing cart');
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
