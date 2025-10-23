"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/cartContext";
import { Settings, Coffee, ShoppingCart, Clock } from "lucide-react";

/**
 * HeaderNav - Mobile-First Persistent Navigation
 *
 * Sticky top navigation bar optimized for mobile devices
 * Shows contextual icons based on app state
 *
 * Always Visible (2 icons):
 * - Settings: Profile, order history, logout
 * - Menu: Primary action (product catalog)
 *
 * Conditional (2 icons):
 * - Timer: Shows when order is processing (clickable to order detail)
 * - Cart: Shows when items in cart (with badge)
 *
 * Features:
 * - Sticky positioning (always on top)
 * - Flash animation when order ready
 * - Countdown timer display
 * - Cart item count badge
 */
export default function HeaderNav() {
  const { cartItems } = useCart();
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isFlashing, setIsFlashing] = useState(false);

  // Check for active processing order and fetch its status
  useEffect(() => {
    const orderId = localStorage.getItem("currentWooId");
    setCurrentOrderId(orderId);

    if (!orderId) return;

    // Fetch order status
    const fetchOrderStatus = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        const order = await res.json();
        setOrderStatus(order.status);

        // If ready, trigger flash
        if (order.status === 'ready-for-pickup') {
          setIsFlashing(true);
        }
      } catch (err) {
        console.error('Failed to fetch order status:', err);
      }
    };

    fetchOrderStatus();
    // Poll every 10 seconds
    const interval = setInterval(fetchOrderStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  // Calculate remaining time for processing orders
  useEffect(() => {
    if (orderStatus !== 'processing') {
      setTimeRemaining("");
      return;
    }

    const updateTimer = () => {
      const endTime = localStorage.getItem("endTime");
      if (!endTime) return;

      const now = Date.now();
      const end = Number(endTime);
      const remaining = end - now;

      if (remaining <= 0) {
        setTimeRemaining("Ready!");
        return;
      }

      // Format as MM:SS
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [orderStatus]);

  // Show timer icon?
  const showTimer = currentOrderId && (orderStatus === 'processing' || orderStatus === 'ready-for-pickup');

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

        {/* Timer Icon - Conditional (only when order processing/ready) */}
        {showTimer && (
          <Link
            href={`/orders/${currentOrderId}`}
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition min-w-[60px] ${
              isFlashing
                ? 'bg-green-500 animate-pulse'
                : 'hover:bg-yellow-100'
            }`}
          >
            <Clock className={`w-6 h-6 ${isFlashing ? 'text-white' : 'text-orange-600'}`} />
            <span className={`text-xs mt-1 font-mono ${isFlashing ? 'text-white font-bold' : 'text-orange-600'}`}>
              {orderStatus === 'ready-for-pickup' ? 'READY!' : timeRemaining}
            </span>
          </Link>
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
