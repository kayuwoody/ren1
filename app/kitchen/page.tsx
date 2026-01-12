"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { labelPrinter } from "@/lib/labelPrinterService";

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  total: string;
  sku?: string;
  meta_data?: Array<{ key: string; value: any }>;
}

interface Order {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  customer_note?: string;
  line_items: OrderItem[];
  meta_data: Array<{ key: string; value: any }>;
}

export default function KitchenDisplayPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  // Track which items are being worked on (kitchen staff can click to mark)
  const [itemsInProgress, setItemsInProgress] = useState<Set<string>>(new Set());

  // Label printing state
  const [labelsPrinted, setLabelsPrinted] = useState<Set<number>>(new Set());
  const [printingOrderId, setPrintingOrderId] = useState<number | null>(null);
  const [labelPrinterConnected, setLabelPrinterConnected] = useState(false);

  // Track previous order IDs to detect new orders
  const previousOrderIds = useRef<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load items in progress from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('kitchen_items_in_progress');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setItemsInProgress(new Set(parsed));
      } catch (err) {
        console.error('Failed to load items in progress:', err);
      }
    }
  }, []);

  // Save items in progress to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(
      'kitchen_items_in_progress',
      JSON.stringify(Array.from(itemsInProgress))
    );
  }, [itemsInProgress]);

  // Load printed labels from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('kitchen_labels_printed');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setLabelsPrinted(new Set(parsed));
      } catch (err) {
        console.error('Failed to load printed labels:', err);
      }
    }
  }, []);

  // Save printed labels to localStorage
  useEffect(() => {
    localStorage.setItem(
      'kitchen_labels_printed',
      JSON.stringify(Array.from(labelsPrinted))
    );
  }, [labelsPrinted]);

  // Connect to label printer (requires user gesture first time)
  const connectLabelPrinter = async () => {
    try {
      const device = await labelPrinter.pair();
      await labelPrinter.connect(device);
      setLabelPrinterConnected(true);
      console.log('🏷️ Label printer connected');
      return true;
    } catch (err: any) {
      console.error('Label printer connection failed:', err);
      alert(`Failed to connect label printer: ${err.message}`);
      return false;
    }
  };

  // Print labels for an order
  const printLabelsForOrder = async (order: Order) => {
    setPrintingOrderId(order.id);

    try {
      // Try to connect if not connected
      if (!labelPrinter.isConnected()) {
        const connected = await connectLabelPrinter();
        if (!connected) {
          setPrintingOrderId(null);
          return;
        }
      }

      // Print a label for each item (quantity times)
      for (const item of order.line_items) {
        for (let i = 0; i < item.quantity; i++) {
          await labelPrinter.printKitchenLabel(order.number, item.name, 1);
          // Small delay between labels
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // Mark order as printed
      setLabelsPrinted(prev => new Set([...prev, order.id]));
      console.log(`🏷️ Printed labels for order #${order.number}`);
    } catch (err: any) {
      console.error('Label printing failed:', err);
      alert(`Failed to print labels: ${err.message}`);
      setLabelPrinterConnected(false);
    } finally {
      setPrintingOrderId(null);
    }
  };

  // Toggle item in progress state
  const toggleItemInProgress = (orderId: number, itemId: number) => {
    const key = `${orderId}-${itemId}`;
    setItemsInProgress((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Clear in-progress items for a specific order
  const clearOrderItems = (orderId: number) => {
    setItemsInProgress((prev) => {
      const next = new Set(prev);
      // Remove all items for this order
      Array.from(next).forEach((key) => {
        if (key.startsWith(`${orderId}-`)) {
          next.delete(key);
        }
      });
      return next;
    });
  };

  // Fetch processing orders (ALL orders, not user-filtered)
  const fetchOrders = async () => {
    try {
      const response = await fetch("/api/kitchen/orders");
      if (!response.ok) {
        throw new Error("Failed to fetch orders");
      }
      const data: Order[] = await response.json();

      // Only orders not yet ready are shown (ready pickup → ready-for-pickup status, ready delivery → processing with out_for_delivery flag)
      console.log(`✅ Kitchen: ${data.length} orders in processing status`);

      // Detect new orders
      const currentOrderIds = new Set<number>(data.map((order) => order.id));
      const newOrders = data.filter(
        (order) => !previousOrderIds.current.has(order.id)
      );

      // Play alert sound if there are new orders (and not first load)
      if (newOrders.length > 0 && previousOrderIds.current.size > 0) {
        playAlert();
      }

      previousOrderIds.current = currentOrderIds;
      setOrders(data);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching orders:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Play alert sound for new orders
  const playAlert = () => {
    // Use Web Audio API beep sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // 800 Hz beep
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  // Mark order as ready (pickup or delivery)
  const markReady = async (orderId: number, readyType: "pickup" | "delivery") => {
    setUpdatingOrderId(orderId);
    try {
      // For pickup: move to ready-for-pickup status
      // For delivery: keep in processing with out_for_delivery flag
      const status = readyType === "pickup" ? "ready-for-pickup" : "processing";

      const response = await fetch(`/api/update-order/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          meta_data: [
            {
              key: "kitchen_ready",
              value: "yes", // Mark as ready (removes from kitchen display)
            },
            {
              key: "fulfillment_method",
              value: readyType, // "pickup" or "delivery"
            },
            {
              key: "out_for_delivery",
              value: readyType === "delivery" ? "yes" : "no",
            },
            {
              key: "ready_timestamp",
              value: new Date().toISOString(),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update order");
      }

      // Clear in-progress items for this order
      clearOrderItems(orderId);

      // Refresh orders immediately
      await fetchOrders();
    } catch (err: any) {
      console.error("Error updating order:", err);
      alert(`Error: ${err.message}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Get time elapsed since order creation
  const getOrderAge = (order: Order) => {
    const createdTime = new Date(order.date_created).getTime();
    const now = Date.now();
    const ageMs = now - createdTime;
    const ageMinutes = Math.floor(ageMs / 60000);
    return ageMinutes;
  };

  // Get timer info from order metadata
  const getTimerInfo = (order: Order) => {
    const startTimeMeta = order.meta_data.find((m) => m.key === "startTime");
    const endTimeMeta = order.meta_data.find((m) => m.key === "endTime");

    if (!startTimeMeta || !endTimeMeta) {
      return null;
    }

    // Handle both ISO date strings and numeric timestamps
    let startTime: number;
    let endTime: number;

    // Try parsing as ISO date first, fallback to numeric timestamp
    if (typeof startTimeMeta.value === 'string' && startTimeMeta.value.includes('T')) {
      startTime = new Date(startTimeMeta.value).getTime();
    } else {
      startTime = parseInt(startTimeMeta.value);
    }

    if (typeof endTimeMeta.value === 'string' && endTimeMeta.value.includes('T')) {
      endTime = new Date(endTimeMeta.value).getTime();
    } else {
      endTime = parseInt(endTimeMeta.value);
    }

    // Validate timestamps
    if (isNaN(startTime) || isNaN(endTime)) {
      console.warn(`Invalid timer metadata for order ${order.id}`, {
        startValue: startTimeMeta.value,
        endValue: endTimeMeta.value,
        startParsed: startTime,
        endParsed: endTime
      });
      return null;
    }

    const now = Date.now();
    const elapsedMs = now - startTime;
    const totalDurationMs = endTime - startTime;
    const remainingMs = endTime - now;

    // Ensure valid calculations
    if (totalDurationMs <= 0) {
      return null;
    }

    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
    const progress = Math.min(100, (elapsedMs / totalDurationMs) * 100);

    // Determine status color
    let statusColor = "green";
    if (progress > 90 || remainingMs < 0) {
      statusColor = "red";
    } else if (progress > 70) {
      statusColor = "yellow";
    }

    return {
      elapsedMinutes,
      remainingMinutes,
      progress,
      statusColor,
      isOverdue: remainingMs < 0,
    };
  };

  // Initial fetch and SSE for real-time updates (no polling)
  useEffect(() => {
    // Fetch initial orders
    fetchOrders();

    // Connect to SSE for push updates
    console.log('🍳 Kitchen Display: Connecting to order updates stream...');
    const eventSource = new EventSource('/api/kitchen/stream');

    eventSource.onopen = () => {
      console.log('🍳 Kitchen Display: Connected to order stream');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('🍳 Kitchen Display: Received event:', data.type);

        if (data.type === 'orders-updated') {
          console.log('🍳 Kitchen Display: Orders updated, fetching latest...');
          fetchOrders();
        } else if (data.type === 'connected') {
          console.log('🍳 Kitchen Display: Connection confirmed');
        }
      } catch (err) {
        console.error('🍳 Kitchen Display: Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('🍳 Kitchen Display: SSE connection error:', error);
      // EventSource will automatically attempt to reconnect
    };

    return () => {
      console.log('🍳 Kitchen Display: Disconnecting from order stream');
      eventSource.close();
    };
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-200 text-xl">Loading kitchen display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-800 p-3">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/admin/orders")}
              className="p-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
            >
              <span className="text-white text-2xl">←</span>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">
                🍳 Kitchen Display
              </h1>
              <p className="text-gray-300 text-sm">
                {orders.length} order{orders.length !== 1 ? "s" : ""} in progress
              </p>
            </div>
          </div>
          <div className="text-right">
            <button
              onClick={fetchOrders}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition text-sm"
            >
              🔄 Refresh
            </button>
            <p className="text-gray-300 text-sm mt-2">
              Auto-refresh: 10s
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border-2 border-red-500 rounded-lg p-4">
          <p className="text-red-700 text-lg">⚠️ {error}</p>
        </div>
      )}

      {/* No Orders */}
      {orders.length === 0 ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-6xl mb-4">✅</p>
            <p className="text-2xl text-white">All caught up!</p>
            <p className="text-gray-300 mt-2">No orders to prepare right now</p>
          </div>
        </div>
      ) : (
        /* Order Grid - Auto-fit columns with max width to prevent single orders from expanding too much */
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,min(450px,100%)))] gap-4">
          {orders.map((order) => {
            const timerInfo = getTimerInfo(order);
            const isUpdating = updatingOrderId === order.id;

            // Border color based on timer status
            let borderColor = "border-gray-600";
            if (timerInfo) {
              if (timerInfo.statusColor === "green") borderColor = "border-green-500";
              else if (timerInfo.statusColor === "yellow") borderColor = "border-yellow-500";
              else if (timerInfo.statusColor === "red") borderColor = "border-red-500";
            }

            return (
              <div
                key={order.id}
                className={`bg-gray-50 rounded-lg border-2 ${borderColor} p-3 shadow-lg min-h-[200px]`}
              >
                {/* Order Number */}
                <div className="mb-2">
                  <h2 className="text-3xl font-bold text-gray-900 mb-1">
                    #{order.number}
                  </h2>
                  <div className="flex items-center justify-between">
                    <p className="text-gray-600 text-sm">Order ID: {order.id}</p>
                    <p className="text-blue-600 text-sm font-semibold">
                      🕐 {getOrderAge(order)}m old
                    </p>
                  </div>
                </div>

                {/* Timer */}
                {timerInfo ? (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-700 text-sm font-medium">
                        {timerInfo.isOverdue ? "OVERDUE" : "Time Remaining"}
                      </span>
                      <span
                        className={`text-2xl font-bold ${
                          timerInfo.statusColor === "green"
                            ? "text-green-600"
                            : timerInfo.statusColor === "yellow"
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {timerInfo.isOverdue ? "+" : ""}
                        {Math.abs(timerInfo.remainingMinutes)}m
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          timerInfo.statusColor === "green"
                            ? "bg-green-500"
                            : timerInfo.statusColor === "yellow"
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(100, timerInfo.progress)}%` }}
                      ></div>
                    </div>
                    <p className="text-gray-600 text-xs mt-1">
                      Started {timerInfo.elapsedMinutes}m ago
                    </p>
                  </div>
                ) : (
                  <div className="mb-4 bg-yellow-50 border border-yellow-500 rounded p-2">
                    <p className="text-yellow-700 text-xs">
                      ⚠️ No timer set for this order
                    </p>
                  </div>
                )}

                {/* Items */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gray-700 text-sm font-semibold uppercase">
                      Items to Prepare
                    </h3>
                    <p className="text-gray-600 text-xs italic">
                      👆 Click to mark in progress
                    </p>
                  </div>
                  <ul className="space-y-3">
                    {order.line_items.map((item) => {
                      // Extract special notes or customizations from item metadata
                      const itemMeta = item.meta_data || [];
                      const hasCustomizations = itemMeta.length > 0;

                      // Check if this item is being worked on
                      const itemKey = `${order.id}-${item.id}`;
                      const isInProgress = itemsInProgress.has(itemKey);

                      return (
                        <li
                          key={item.id}
                          onClick={() => toggleItemInProgress(order.id, item.id)}
                          className={`rounded-lg p-3 cursor-pointer transition-all ${
                            isInProgress
                              ? "bg-blue-100 ring-2 ring-blue-400 border border-blue-300"
                              : "bg-white hover:bg-gray-100 border border-gray-300"
                          }`}
                          title="Click to mark as in progress"
                        >
                          <div className="flex items-start gap-3">
                            <span className={`font-bold text-xl px-3 py-2 rounded min-w-[3.5rem] text-center flex-shrink-0 ${
                              isInProgress
                                ? "bg-blue-500 text-white"
                                : "bg-green-600 text-white"
                            }`}>
                              {isInProgress ? "👨‍🍳" : `${item.quantity}×`}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-lg font-semibold leading-tight ${
                                isInProgress ? "text-blue-900" : "text-gray-900"
                              }`}>
                                {item.name}
                              </p>

                              {/* Item SKU if available */}
                              {item.sku && (
                                <p className={`text-xs mt-1 ${
                                  isInProgress ? "text-blue-700" : "text-gray-600"
                                }`}>
                                  SKU: {item.sku}
                                </p>
                              )}

                              {/* Item customizations/metadata */}
                              {hasCustomizations && (
                                <div className="mt-2 space-y-1">
                                  {itemMeta.map((meta: any, idx: number) => {
                                    // Skip internal metadata
                                    if (meta.key.startsWith('_')) return null;

                                    return (
                                      <div key={idx} className="text-sm">
                                        <span className={isInProgress ? "text-blue-700" : "text-yellow-700"}>
                                          ▸ {meta.display_key || meta.key}:
                                        </span>
                                        <span className={`ml-1 ${
                                          isInProgress ? "text-blue-900" : "text-gray-900"
                                        }`}>
                                          {typeof meta.display_value !== 'undefined' ? meta.display_value : meta.value}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Price for reference */}
                              <p className={`text-xs mt-2 ${
                                isInProgress ? "text-blue-700" : "text-gray-600"
                              }`}>
                                RM {parseFloat(item.total).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Order Notes/Special Instructions */}
                {order.customer_note && (
                  <div className="mb-4 bg-yellow-50 border-2 border-yellow-500 rounded-lg p-3">
                    <h4 className="text-yellow-800 text-xs font-semibold uppercase mb-1 flex items-center gap-1">
                      <span>📝</span>
                      <span>Special Instructions</span>
                    </h4>
                    <p className="text-yellow-900 text-sm font-medium">
                      {order.customer_note}
                    </p>
                  </div>
                )}

                {/* Order Total */}
                <div className="mb-4 bg-gray-100 rounded-lg p-3 border border-gray-300">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 text-sm">Order Total</span>
                    <span className="text-gray-900 text-xl font-bold">
                      RM {parseFloat(order.total).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Print Labels Button */}
                <div className="mb-3">
                  <button
                    onClick={() => printLabelsForOrder(order)}
                    disabled={printingOrderId === order.id}
                    className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                      labelsPrinted.has(order.id)
                        ? "bg-gray-200 text-gray-600 hover:bg-orange-100 hover:text-orange-700"
                        : printingOrderId === order.id
                        ? "bg-orange-300 text-orange-800 cursor-not-allowed"
                        : "bg-orange-500 text-white hover:bg-orange-400 active:scale-95"
                    }`}
                  >
                    {printingOrderId === order.id ? (
                      "🏷️ Printing..."
                    ) : labelsPrinted.has(order.id) ? (
                      "🏷️ Reprint Labels"
                    ) : (
                      "🏷️ Print Labels"
                    )}
                  </button>
                </div>

                {/* Mark Ready Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => markReady(order.id, "pickup")}
                    disabled={isUpdating}
                    className={`py-3 rounded-lg font-bold text-base transition-all ${
                      isUpdating
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-500 active:scale-95"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>{isUpdating ? "⏳" : "✅"}</span>
                      <span className="text-sm">{isUpdating ? "Wait..." : "Ready Pickup"}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => markReady(order.id, "delivery")}
                    disabled={isUpdating}
                    className={`py-3 rounded-lg font-bold text-base transition-all ${
                      isUpdating
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-500 active:scale-95"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>{isUpdating ? "⏳" : "🚗"}</span>
                      <span className="text-sm">{isUpdating ? "Wait..." : "Ready Delivery"}</span>
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
