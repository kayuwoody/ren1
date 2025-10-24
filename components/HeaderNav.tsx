"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useCart } from "@/context/cartContext";
import { Settings, Coffee, ShoppingCart, Clock, ChevronDown } from "lucide-react";

/**
 * HeaderNav - Mobile-First Persistent Navigation
 *
 * Updated to support multiple concurrent orders
 * Shows dropdown with all active orders when clicked
 */

interface OrderStatus {
  id: string;
  status: string;
  timeRemaining: string;
  isReady: boolean;
  meta?: any;
}

export default function HeaderNav() {
  const { cartItems } = useCart();
  const [activeOrders, setActiveOrders] = useState<OrderStatus[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch status for all active orders
  useEffect(() => {
    const fetchActiveOrders = async () => {
      const activeOrderIds = JSON.parse(localStorage.getItem('activeOrders') || '[]');

      if (activeOrderIds.length === 0) {
        setActiveOrders([]);
        return;
      }

      const ordersData: OrderStatus[] = [];

      for (const orderId of activeOrderIds) {
        try {
          const res = await fetch(`/api/orders/${orderId}`);
          if (!res.ok) continue;

          const order = await res.json();

          // Remove completed orders from active list
          if (order.status === 'completed') {
            const filtered = activeOrderIds.filter((id: string) => id !== orderId);
            localStorage.setItem('activeOrders', JSON.stringify(filtered));
            continue;
          }

          // Only track processing or ready orders
          if (order.status === 'processing' || order.status === 'ready-for-pickup') {
            const startTime = order.meta_data?.find((m: any) => m.key === 'startTime')?.value;
            const endTime = order.meta_data?.find((m: any) => m.key === 'endTime')?.value;

            let timeRemaining = '';
            if (order.status === 'ready-for-pickup') {
              timeRemaining = 'READY!';
            } else if (startTime && endTime) {
              const remaining = Number(endTime) - Date.now();
              if (remaining > 0) {
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                timeRemaining = `${minutes}:${seconds.toString().padStart(2, '0')}`;
              } else {
                timeRemaining = 'Ready!';
              }
            }

            ordersData.push({
              id: orderId,
              status: order.status,
              timeRemaining,
              isReady: order.status === 'ready-for-pickup',
              meta: order.meta_data
            });
          }
        } catch (err) {
          console.error(`Failed to fetch order ${orderId}:`, err);
        }
      }

      setActiveOrders(ordersData);
    };

    fetchActiveOrders();

    // Poll every 10 seconds
    const interval = setInterval(fetchActiveOrders, 10000);

    return () => clearInterval(interval);
  }, []);

  // Update timers every second
  useEffect(() => {
    if (activeOrders.length === 0) return;

    const interval = setInterval(() => {
      setActiveOrders(prevOrders => {
        return prevOrders.map(order => {
          if (order.isReady || order.timeRemaining === 'READY!') {
            return order;
          }

          const meta = order.meta;
          const endTime = meta?.find((m: any) => m.key === 'endTime')?.value;

          if (!endTime) return order;

          const remaining = Number(endTime) - Date.now();
          if (remaining <= 0) {
            return { ...order, timeRemaining: 'Ready!' };
          }

          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          const timeRemaining = `${minutes}:${seconds.toString().padStart(2, '0')}`;

          return { ...order, timeRemaining };
        });
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeOrders.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show timer icon?
  const showTimer = activeOrders.length > 0;
  const hasReadyOrder = activeOrders.some(o => o.isReady);

  // Show cart icon?
  const showCart = cartItems.length > 0;

  return (
    <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
      <nav className="max-w-md mx-auto px-4 h-16 flex items-center justify-between gap-4">

        {/* Settings Icon - Always visible */}
        <Link
          href="/settings"
          className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition min-w-[60px]"
        >
          <Settings className="w-6 h-6 text-gray-700" />
          <span className="text-xs text-gray-600 mt-1">Settings</span>
        </Link>

        {/* Menu Icon - Always visible, highlighted as primary */}
        <Link
          href="/products"
          className="flex flex-col items-center justify-center p-2 hover:bg-green-100 rounded-lg transition min-w-[60px] bg-green-50"
        >
          <Coffee className="w-6 h-6 text-green-700" />
          <span className="text-xs text-green-700 mt-1 font-semibold">Menu</span>
        </Link>

        {/* Timer Icon - Conditional (shows all active orders) */}
        {showTimer && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg transition min-w-[60px] relative ${
                hasReadyOrder
                  ? 'bg-green-500 animate-pulse'
                  : 'hover:bg-yellow-100'
              }`}
            >
              <div className="relative">
                <Clock className={`w-6 h-6 ${hasReadyOrder ? 'text-white' : 'text-orange-600'}`} />
                {activeOrders.length > 1 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {activeOrders.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs mt-1 font-mono ${hasReadyOrder ? 'text-white font-bold' : 'text-orange-600'}`}>
                  {hasReadyOrder ? 'READY!' : `${activeOrders.length} Order${activeOrders.length > 1 ? 's' : ''}`}
                </span>
                <ChevronDown className={`w-3 h-3 ${hasReadyOrder ? 'text-white' : 'text-orange-600'}`} />
              </div>
            </button>

            {/* Dropdown with all active orders */}
            {showDropdown && (
              <div className="absolute top-full right-0 mt-2 bg-white border shadow-lg rounded-lg py-2 min-w-[280px]">
                <div className="px-4 py-2 border-b">
                  <p className="text-sm font-semibold text-gray-700">Active Orders</p>
                </div>
                {activeOrders.map(order => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    onClick={() => setShowDropdown(false)}
                    className="block px-4 py-3 hover:bg-gray-50 border-b last:border-b-0"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-gray-800">Order #{order.id}</p>
                        <p className="text-xs text-gray-500 capitalize">{order.status.replace('-', ' ')}</p>
                      </div>
                      <div className={`text-right ${order.isReady ? 'animate-pulse' : ''}`}>
                        <p className={`font-mono font-bold ${order.isReady ? 'text-green-600' : 'text-orange-600'}`}>
                          {order.timeRemaining}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
                <div className="px-4 py-2 border-t">
                  <Link
                    href="/orders"
                    onClick={() => setShowDropdown(false)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View All Orders →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cart Icon - Conditional (only when items in cart) */}
        {showCart && (
          <Link
            href="/cart"
            className="flex flex-col items-center justify-center p-2 hover:bg-blue-100 rounded-lg transition min-w-[60px] relative"
          >
            <ShoppingCart className="w-6 h-6 text-blue-600" />
            <span className="text-xs text-blue-600 mt-1">Cart</span>
            {/* Badge with item count */}
            <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cartItems.length}
            </span>
          </Link>
        )}

      </nav>
    </header>
  );
}
