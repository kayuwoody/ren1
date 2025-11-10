'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem {
  productId: number;
  name: string;               // Display name (e.g., "Hot Latte" for bundles)
  retailPrice: number;        // Original catalog price
  discountPercent?: number;   // Discount as percentage (0-100)
  discountAmount?: number;    // Discount as fixed amount
  discountReason?: string;    // Why discount was applied
  finalPrice: number;         // Actual selling price after discount
  quantity: number;
  bundle?: {                  // Optional: for products with mandatory/optional components
    baseProductId: number;
    baseProductName: string;
    selectedMandatory: Record<string, string>; // groupName -> selectedItemId
    selectedOptional: string[]; // array of item IDs
  };
  components?: Array<{        // Optional: expanded bundle components (fetched once at add time)
    productId: string;
    productName: string;
    quantity: number;
  }>;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: Omit<CartItem, 'finalPrice'>) => void;
  removeFromCart: (index: number) => void;
  updateItemDiscount: (index: number, discount: {
    type: 'percent' | 'amount' | 'override',
    value: number,
    reason?: string
  }) => void;
  clearCart: () => void;
  loadCart: (items: CartItem[]) => void;
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

// Check if two cart items are the same (considering bundle variations)
function isSameCartItem(item1: CartItem, item2: Omit<CartItem, 'finalPrice'>): boolean {
  // Must have same productId
  if (item1.productId !== item2.productId) return false;

  // If neither has bundle, they're the same
  if (!item1.bundle && !item2.bundle) return true;

  // If only one has bundle, they're different
  if (!item1.bundle || !item2.bundle) return false;

  // Compare bundle configurations
  const mandatory1 = JSON.stringify(item1.bundle.selectedMandatory);
  const mandatory2 = JSON.stringify(item2.bundle.selectedMandatory);

  const optional1 = JSON.stringify(item1.bundle.selectedOptional.sort());
  const optional2 = JSON.stringify(item2.bundle.selectedOptional.sort());

  return mandatory1 === mandatory2 && optional1 === optional2;
}

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount (for persistence across page refreshes)
  useEffect(() => {
    const saved = localStorage.getItem('cart');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        // Migrate old cart items that don't have retailPrice/finalPrice
        const migratedItems = parsed.map((item: any) => {
          // If item has old 'price' field but not 'retailPrice', migrate it
          if (item.price !== undefined && item.retailPrice === undefined) {
            console.log('🔄 Migrating old cart item:', item.name);
            return {
              productId: item.productId,
              name: item.name,
              retailPrice: parseFloat(item.price),
              finalPrice: parseFloat(item.price),
              quantity: item.quantity,
              discountPercent: undefined,
              discountAmount: undefined,
              discountReason: undefined
            };
          }

          // If item has retailPrice but finalPrice is missing, calculate it
          if (item.retailPrice !== undefined && item.finalPrice === undefined) {
            console.log('🔄 Recalculating finalPrice for:', item.name);
            return {
              ...item,
              finalPrice: calculateFinalPrice(item)
            };
          }

          return item;
        });

        setCartItems(migratedItems);
        console.log('🛒 Loaded cart from localStorage:', migratedItems);
      } catch (err) {
        console.error('Failed to parse saved cart:', err);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cartItems));
    console.log('💾 Saved cart to localStorage:', cartItems);

    // Sync to server for cross-device updates (customer display)
    fetch('/api/cart/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart: cartItems })
    }).catch(err => console.error('Failed to sync cart to server:', err));

    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new CustomEvent('cart-updated', { detail: cartItems }));
  }, [cartItems]);

  // Listen for storage changes from other tabs/windows (for customer display)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cart' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          console.log('🔄 Cart updated from another tab:', parsed);
          setCartItems(parsed);
        } catch (err) {
          console.error('Failed to parse cart from storage event:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const addToCart = (item: Omit<CartItem, 'finalPrice'>) => {
    const finalPrice = calculateFinalPrice(item);
    const fullItem: CartItem = { ...item, finalPrice };

    console.log('➕ Adding to cart:', fullItem);
    setCartItems(prev => {
      // Check if same item exists (considering bundle variations)
      const existing = prev.find(ci => isSameCartItem(ci, item));
      if (existing) {
        // Update quantity if identical item already exists
        console.log('   Found matching item, increasing quantity');
        return prev.map(ci =>
          isSameCartItem(ci, item)
            ? { ...ci, quantity: ci.quantity + item.quantity }
            : ci
        );
      } else {
        // Add new item
        console.log('   New item, adding to cart');
        return [...prev, fullItem];
      }
    });
  };

  const removeFromCart = (index: number) => {
    console.log('➖ Removing from cart at index:', index);
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItemDiscount = (
    index: number,
    discount: { type: 'percent' | 'amount' | 'override', value: number, reason?: string }
  ) => {
    console.log('💰 Updating discount for cart item at index:', index, discount);

    setCartItems(prev => prev.map((item, i) => {
      if (i !== index) return item;

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

  const loadCart = (items: CartItem[]) => {
    console.log('📥 Loading cart with', items.length, 'items');
    setCartItems(items);
    localStorage.setItem('cart', JSON.stringify(items));
  };

  return (
    <CartContext.Provider value={{ cartItems, addToCart, removeFromCart, updateItemDiscount, clearCart, loadCart }}>
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
