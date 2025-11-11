"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function CustomerDisplayPage() {
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Fix hydration error - only show time after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for cart updates via Server-Sent Events (push-based, no polling)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isManualClose = false;

    const connect = () => {
      console.log('📺 Customer Display: Connecting to cart updates stream...');
      setConnectionStatus('connecting');

      // Connect to SSE endpoint
      eventSource = new EventSource('/api/cart/stream');

      eventSource.onopen = () => {
        console.log('📺 Customer Display: ✅ Connected to cart stream');
        setConnectionStatus('connected');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📺 Customer Display: Received event:', data.type, new Date().toISOString());

          if (data.type === 'cart-update') {
            setCartItems(data.cart || []);
            console.log('📺 Customer Display: Updated cart with', data.cart?.length || 0, 'items');
          } else if (data.type === 'connected') {
            console.log('📺 Customer Display: Connection confirmed by server');
            // Fetch initial cart state
            fetch('/api/cart/current')
              .then(res => res.json())
              .then(data => {
                setCartItems(data.cart || []);
                console.log('📺 Customer Display: Loaded initial cart with', data.cart?.length || 0, 'items');
              })
              .catch(err => console.error('Failed to fetch initial cart:', err));
          }
        } catch (err) {
          console.error('📺 Customer Display: Failed to parse SSE message:', err);
        }
      };

      eventSource.onerror = (error) => {
        console.error('📺 Customer Display: ❌ SSE connection error:', error);
        console.log('📺 Customer Display: Ready state:', eventSource?.readyState);
        setConnectionStatus('disconnected');

        // Close the failed connection
        if (eventSource) {
          eventSource.close();
        }

        // Only reconnect if not manually closed
        if (!isManualClose) {
          console.log('📺 Customer Display: Will attempt reconnect in 3 seconds...');
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    };

    // Initial connection
    connect();

    return () => {
      console.log('📺 Customer Display: 🔌 Disconnecting from cart stream (component unmount)');
      isManualClose = true;

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      if (eventSource) {
        eventSource.close();
      }

      setConnectionStatus('disconnected');
    };
  }, []);

  // Calculate totals
  const retailTotal = cartItems.reduce((sum, item) => sum + item.retailPrice * item.quantity, 0);
  const finalTotal = cartItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
  const totalDiscount = retailTotal - finalTotal;
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const hasDiscount = totalDiscount > 0;

  return (
    <div className="min-h-screen bg-white p-4 flex flex-col">
      {/* Header */}
      <div className="mb-4 border-b border-gray-200 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-36 w-auto">
              <Image
                src="/co line mascot.png"
                alt="Coffee Oasis"
                width={800}
                height={144}
                className="object-contain"
              />
            </div>
          </div>
          <div className="text-right">
            {/* Connection Status Indicator */}
            <div className="mb-2 flex items-center justify-end gap-2">
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' :
                connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-red-500'
              }`} />
              <span className="text-xs text-gray-500">
                {connectionStatus === 'connected' ? 'Live' :
                 connectionStatus === 'connecting' ? 'Connecting...' :
                 'Disconnected'}
              </span>
            </div>
            {mounted && (
              <>
                <p className="text-xl font-mono text-gray-800">
                  {currentTime.toLocaleTimeString('en-MY', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}
                </p>
                <p className="text-xs text-gray-600">
                  {currentTime.toLocaleDateString('en-MY', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                  })}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Your Order Text */}
      <div className="mb-4">
        <p className="text-2xl font-semibold text-gray-800">Your Order</p>
      </div>

      {/* Items List */}
      <div className="flex-1 mb-4">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-center">
              <div className="relative w-72 h-72 mx-auto mb-4">
                <Image
                  src="/co mascot.png"
                  alt="Coffee Oasis Mascot"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <p className="text-2xl font-light text-gray-600">
                Your cart is empty
              </p>
              <p className="text-sm text-gray-400 mt-2">
                Items will appear here as they are added
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {cartItems.map((item, index) => {
              const itemTotal = item.finalPrice * item.quantity;
              const itemRetailTotal = item.retailPrice * item.quantity;
              const itemDiscount = itemRetailTotal - itemTotal;
              const hasItemDiscount = itemDiscount > 0;

              // Get expanded components from cart item
              const expandedComponents = item.components || [];

              return (
                <div
                  key={index}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Quantity and Name */}
                    <div className="flex-1">
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-2xl font-bold text-blue-600">
                          {item.quantity}×
                        </span>
                        <h3 className="text-xl font-semibold text-gray-800">
                          {item.name}
                        </h3>
                      </div>

                      {/* Show expanded components */}
                      {expandedComponents.length > 0 && (
                        <div className="mt-2 ml-12 space-y-1">
                          {expandedComponents.map((component: any, idx: number) => (
                            <div key={idx} className="text-base text-gray-600 flex items-start">
                              <span className="mr-2">→</span>
                              <span>{component.productName} × {component.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Discount Reason */}
                      {hasItemDiscount && item.discountReason && (
                        <p className="text-sm text-green-600 flex items-center gap-2 ml-10 mt-2">
                          <span>🎉</span>
                          {item.discountReason}
                        </p>
                      )}
                    </div>

                    {/* Right: Price */}
                    <div className="text-right">
                      {hasItemDiscount ? (
                        <>
                          <p className="text-sm text-gray-400 line-through">
                            RM {itemRetailTotal.toFixed(2)}
                          </p>
                          <p className="text-2xl font-bold text-green-600">
                            RM {itemTotal.toFixed(2)}
                          </p>
                          <p className="text-xs text-green-600">
                            Save RM {itemDiscount.toFixed(2)}
                          </p>
                        </>
                      ) : (
                        <p className="text-2xl font-bold text-gray-800">
                          RM {itemTotal.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Total Section */}
      {cartItems.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200 shadow-md">
          <div className="space-y-2">
            {/* Item Count */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Items</span>
              <span className="font-semibold text-gray-800">{totalItems}</span>
            </div>

            {/* Subtotal (if discount) */}
            {hasDiscount && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="line-through text-gray-400">
                  RM {retailTotal.toFixed(2)}
                </span>
              </div>
            )}

            {/* Discount */}
            {hasDiscount && (
              <div className="flex items-center justify-between text-sm text-green-600">
                <span className="flex items-center gap-1">
                  <span className="text-base">🎉</span>
                  Discount
                </span>
                <span className="font-semibold">
                  -RM {totalDiscount.toFixed(2)}
                </span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-blue-200 my-2"></div>

            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold text-gray-800">TOTAL</span>
              <span className="text-3xl font-bold text-blue-600">
                RM {finalTotal.toFixed(2)}
              </span>
            </div>

            {/* Savings Summary */}
            {hasDiscount && (
              <div className="text-center pt-2">
                <p className="text-sm text-green-600 font-semibold">
                  🎊 You saved RM {totalDiscount.toFixed(2)}!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 text-center">
        <p className="text-xs text-gray-600">
          Thank you for choosing Coffee Oasis! ☕
        </p>
      </div>
    </div>
  );
}
