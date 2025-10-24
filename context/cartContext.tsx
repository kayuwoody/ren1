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
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount (for persistence across page refreshes)
  useEffect(() => {
    const saved = localStorage.getItem('cart');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCartItems(parsed);
        console.log('🛒 Loaded cart from localStorage:', parsed);
      } catch (err) {
        console.error('Failed to parse saved cart:', err);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cartItems));
    console.log('💾 Saved cart to localStorage:', cartItems);
  }, [cartItems]);

  const addToCart = (item: CartItem) => {
    console.log('➕ Adding to cart:', item);
    setCartItems(prev => {
      const existing = prev.find(ci => ci.productId === item.productId);
      if (existing) {
        // Update quantity if item already exists
        return prev.map(ci =>
          ci.productId === item.productId
            ? { ...ci, quantity: ci.quantity + item.quantity }
            : ci
        );
      } else {
        // Add new item
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
    localStorage.removeItem('cart');
  };

  return (
    <CartContext.Provider value={{ cartItems, addToCart, removeFromCart, clearCart }}>
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
