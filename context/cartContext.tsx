'use client';
import React, { createContext, useContext, useState, ReactNode } from 'react';

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
      console.log("🛒 cartItems:", cartItems);
  const addToCart = (item: CartItem) => {
  setCartItems(prev =>
      prev.map(ci => 
        ci.productId === item.productId ? { ...ci, quantity: ci.quantity + item.quantity } : ci
      ).concat(!prev.find(ci => ci.productId === item.productId) ? item : [])
    );
  };

  const removeFromCart = (productId: number) => {
    setCartItems(prev => prev.filter(ci => ci.productId !== productId));
  };

  const clearCart = () => {
    setCartItems([]);
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
