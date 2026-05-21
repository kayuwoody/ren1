'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem {
  productId: number | string;
  name: string;               // Display name (e.g., "Hot Latte" for bundles)
  retailPrice: number;        // Original catalog price
  discountPercent?: number;   // Discount as percentage (0-100)
  discountAmount?: number;    // Discount as fixed amount
  discountReason?: string;    // Why discount was applied
  surchargeAmount?: number;   // Fixed amount added to price (e.g., upgrade)
  surchargeReason?: string;   // Why surcharge was applied
  finalPrice: number;         // Actual selling price after discount/surcharge
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

export interface CartCustomer {
  member_id: string;
  phone: string;
  name: string | null;
}

export interface CartVoucher {
  id: string;
  code: string;
  type: 'fixed' | 'percent';
  discount_value: number;
  discount_amount: number;
}

export interface CartPass {
  id: string;
  code: string;
  program_name: string;
  uses_remaining: number;
  eligible_product_ids: string[];
}

interface CartContextType {
  cartItems: CartItem[];
  customer: CartCustomer | null;
  voucher: CartVoucher | null;
  pass: CartPass | null;
  addToCart: (item: Omit<CartItem, 'finalPrice'>) => void;
  removeFromCart: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  updateItemDiscount: (index: number, discount: {
    type: 'percent' | 'amount' | 'override',
    value: number,
    reason?: string
  }) => void;
  updateItemSurcharge: (index: number, amount: number, reason?: string) => void;
  setCustomer: (customer: CartCustomer | null) => void;
  setVoucher: (voucher: CartVoucher | null) => void;
  setPass: (pass: CartPass | null) => void;
  clearCart: () => void;
  loadCart: (items: CartItem[]) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Calculate final price based on discount and surcharge
function calculateFinalPrice(item: Omit<CartItem, 'finalPrice'>): number {
  const { retailPrice, discountPercent, discountAmount, surchargeAmount } = item;

  let price = retailPrice;

  if (discountAmount !== undefined && discountAmount > 0) {
    price = Math.max(0, price - discountAmount);
  } else if (discountPercent !== undefined && discountPercent > 0) {
    price = price * (1 - discountPercent / 100);
  }

  if (surchargeAmount !== undefined && surchargeAmount > 0) {
    price += surchargeAmount;
  }

  return price;
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
  const [customer, setCustomerState] = useState<CartCustomer | null>(null);
  const [voucher, setVoucherState] = useState<CartVoucher | null>(null);
  const [pass, setPassState] = useState<CartPass | null>(null);

  // Load cart from localStorage on mount (for persistence across page refreshes)
  useEffect(() => {
    try {
      const savedCustomer = localStorage.getItem('cart_customer');
      if (savedCustomer) setCustomerState(JSON.parse(savedCustomer));
      const savedVoucher = localStorage.getItem('cart_voucher');
      if (savedVoucher) setVoucherState(JSON.parse(savedVoucher));
      const savedPass = localStorage.getItem('cart_pass');
      if (savedPass) setPassState(JSON.parse(savedPass));
    } catch {}

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

    // Sync to server for cross-device updates (customer display)
    fetch('/api/cart/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart: cartItems, voucher: voucher, pass: pass })
    }).catch(err => console.error('Failed to sync cart to server:', err));

    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new CustomEvent('cart-updated', { detail: cartItems }));
  }, [cartItems, voucher, pass]);

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

  const updateQuantity = (index: number, quantity: number) => {
    console.log('🔢 Updating quantity at index:', index, 'to', quantity);
    if (quantity <= 0) {
      // Remove item if quantity is 0 or less
      removeFromCart(index);
      return;
    }
    setCartItems(prev => prev.map((item, i) =>
      i === index ? { ...item, quantity } : item
    ));
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

  const updateItemSurcharge = (index: number, amount: number, reason?: string) => {
    console.log('💰 Updating surcharge for cart item at index:', index, { amount, reason });

    setCartItems(prev => prev.map((item, i) => {
      if (i !== index) return item;

      const updated: Omit<CartItem, 'finalPrice'> = {
        ...item,
        surchargeAmount: amount > 0 ? amount : undefined,
        surchargeReason: amount > 0 ? (reason || 'Surcharge') : undefined,
      };

      return {
        ...updated,
        finalPrice: calculateFinalPrice(updated)
      };
    }));
  };

  const setCustomer = (c: CartCustomer | null) => {
    setCustomerState(c);
    if (c) localStorage.setItem('cart_customer', JSON.stringify(c));
    else localStorage.removeItem('cart_customer');
  };

  const setVoucher = (v: CartVoucher | null) => {
    setVoucherState(v);
    if (v) localStorage.setItem('cart_voucher', JSON.stringify(v));
    else localStorage.removeItem('cart_voucher');
  };

  const setPass = (p: CartPass | null) => {
    setPassState(p);
    if (p) localStorage.setItem('cart_pass', JSON.stringify(p));
    else localStorage.removeItem('cart_pass');
  };

  const clearCart = () => {
    console.log('🗑️ Clearing cart');
    setCartItems([]);
    setCustomer(null);
    setVoucher(null);
    setPass(null);
    localStorage.removeItem('cart');
  };

  const loadCart = (items: CartItem[]) => {
    console.log('📥 Loading cart with', items.length, 'items');
    setCartItems(items);
    localStorage.setItem('cart', JSON.stringify(items));
  };

  return (
    <CartContext.Provider value={{ cartItems, customer, voucher, pass, addToCart, removeFromCart, updateQuantity, updateItemDiscount, updateItemSurcharge, setCustomer, setVoucher, setPass, clearCart, loadCart }}>
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
