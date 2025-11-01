'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem {
  productId: number;
  name: string;
  retailPrice: number;        // Original catalog price
  discountPercent?: number;   // Discount as percentage (0-100)
  discountAmount?: number;    // Discount as fixed amount
  discountReason?: string;    // Why discount was applied
  finalPrice: number;         // Actual selling price after discount
  quantity: number;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: Omit<CartItem, 'finalPrice'>) => void;
  removeFromCart: (productId: number) => void;
  updateItemDiscount: (productId: number, discount: {
    type: 'percent' | 'amount' | 'override',
    value: number,
    reason?: string
  }) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Calculate final price based on discount
function calculateFinalPrice(item: Omit<CartItem, 'finalPrice'>): number {
  const { retailPrice, discountPercent, discountAmount } = item;

  if (discountAmount !== undefined && discountAmount > 0) {
    return Math.max(0, retailPrice - discountAmount);
  }

  if (discountPercent !== undefined && discountPercent > 0) {
    return retailPrice * (1 - discountPercent / 100);
  }

  return retailPrice;
}

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

  const addToCart = (item: Omit<CartItem, 'finalPrice'>) => {
    const finalPrice = calculateFinalPrice(item);
    const fullItem: CartItem = { ...item, finalPrice };

    console.log('➕ Adding to cart:', fullItem);
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
        return [...prev, fullItem];
      }
    });
  };

  const removeFromCart = (productId: number) => {
    console.log('➖ Removing from cart:', productId);
    setCartItems(prev => prev.filter(ci => ci.productId !== productId));
  };

  const updateItemDiscount = (
    productId: number,
    discount: { type: 'percent' | 'amount' | 'override', value: number, reason?: string }
  ) => {
    console.log('💰 Updating discount for', productId, discount);

    setCartItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;

      let updated: Omit<CartItem, 'finalPrice'>;

      if (discount.type === 'percent') {
        updated = {
          ...item,
          discountPercent: discount.value,
          discountAmount: undefined,
          discountReason: discount.reason
        };
      } else if (discount.type === 'amount') {
        updated = {
          ...item,
          discountPercent: undefined,
          discountAmount: discount.value,
          discountReason: discount.reason
        };
      } else { // override
        updated = {
          ...item,
          discountPercent: undefined,
          discountAmount: item.retailPrice - discount.value,
          discountReason: discount.reason || 'Price Override'
        };
      }

      return {
        ...updated,
        finalPrice: calculateFinalPrice(updated)
      };
    }));
  };

  const clearCart = () => {
    console.log('🗑️ Clearing cart');
    setCartItems([]);
    localStorage.removeItem('cart');
  };

  return (
    <CartContext.Provider value={{ cartItems, addToCart, removeFromCart, updateItemDiscount, clearCart }}>
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
