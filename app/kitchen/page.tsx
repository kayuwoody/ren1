"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  total: string;
}

interface Order {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  line_items: OrderItem[];
  meta_data: Array<{ key: string; value: any }>;
}

export default function KitchenDisplayPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  // Track previous order IDs to detect new orders
  const previousOrderIds = useRef<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch processing orders (ALL orders, not user-filtered)
  const fetchOrders = async () => {
    try {
      const response = await fetch("/api/kitchen/orders");
      if (!response.ok) {
        throw new Error("Failed to fetch orders");
      }
      const data: Order[] = await response.json();

      // All processing orders are shown (ready orders moved to ready-for-pickup status)
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
      // Keep status as processing, use metadata to track ready state
      // This allows orders to remain visible in appropriate screens until actually completed
      const response = await fetch(`/api/update-order/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "processing", // Keep in processing
          meta_data: [
            {
              key: "_kitchen_ready",
              value: "yes", // Mark as ready (removes from kitchen display)
            },
            {
              key: "_fulfillment_method",
              value: readyType, // "pickup" or "delivery"
            },
            {
              key: "_out_for_delivery",
              value: readyType === "delivery" ? "yes" : "no",
            },
            {
              key: "_ready_timestamp",
              value: new Date().toISOString(),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update order");
      }

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

  // Initial fetch and polling
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-300 text-xl">Loading kitchen display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/admin/orders")}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              <span className="text-white text-2xl">←</span>
            </button>
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                🍳 Kitchen Display
              </h1>
              <p className="text-gray-400 text-lg">
                {orders.length} order{orders.length !== 1 ? "s" : ""} in progress
              </p>
            </div>
          </div>
          <div className="text-right">
            <button
              onClick={fetchOrders}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition text-sm"
            >
              🔄 Refresh
            </button>
            <p className="text-gray-500 text-sm mt-2">
              Auto-refresh: 10s
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-900 border-2 border-red-500 rounded-lg p-4">
          <p className="text-red-200 text-lg">⚠️ {error}</p>
        </div>
      )}

      {/* No Orders */}
      {orders.length === 0 ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-6xl mb-4">✅</p>
            <p className="text-2xl text-gray-400">All caught up!</p>
            <p className="text-gray-500 mt-2">No orders to prepare right now</p>
          </div>
        </div>
      ) : (
        /* Order Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                className={`bg-gray-800 rounded-lg border-4 ${borderColor} p-6 shadow-xl transform transition-all hover:scale-105`}
              >
                {/* Order Number */}
                <div className="mb-4">
                  <h2 className="text-5xl font-bold text-white mb-1">
                    #{order.number}
                  </h2>
                  <div className="flex items-center justify-between">
                    <p className="text-gray-400 text-sm">Order ID: {order.id}</p>
                    <p className="text-blue-400 text-sm font-semibold">
                      🕐 {getOrderAge(order)}m old
                    </p>
                  </div>
                </div>

                {/* Timer */}
                {timerInfo ? (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-300 text-sm font-medium">
                        {timerInfo.isOverdue ? "OVERDUE" : "Time Remaining"}
                      </span>
                      <span
                        className={`text-2xl font-bold ${
                          timerInfo.statusColor === "green"
                            ? "text-green-400"
                            : timerInfo.statusColor === "yellow"
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}
                      >
                        {timerInfo.isOverdue ? "+" : ""}
                        {Math.abs(timerInfo.remainingMinutes)}m
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-3">
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
                    <p className="text-gray-500 text-xs mt-1">
                      Started {timerInfo.elapsedMinutes}m ago
                    </p>
                  </div>
                ) : (
                  <div className="mb-4 bg-yellow-900 border border-yellow-600 rounded p-2">
                    <p className="text-yellow-300 text-xs">
                      ⚠️ No timer set for this order
                    </p>
                  </div>
                )}

                {/* Items */}
                <div className="mb-4">
                  <h3 className="text-gray-400 text-sm font-semibold mb-2 uppercase">
                    Items
                  </h3>
                  <ul className="space-y-2">
                    {order.line_items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-3 text-white"
                      >
                        <span className="bg-gray-700 text-green-400 font-bold text-lg px-3 py-1 rounded min-w-[3rem] text-center">
                          {item.quantity}×
                        </span>
                        <span className="text-lg font-medium flex-1 leading-tight pt-1">
                          {item.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Mark Ready Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => markReady(order.id, "pickup")}
                    disabled={isUpdating}
                    className={`py-3 rounded-lg font-bold text-base transition-all ${
                      isUpdating
                        ? "bg-gray-600 text-gray-400 cursor-not-allowed"
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
                        ? "bg-gray-600 text-gray-400 cursor-not-allowed"
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
