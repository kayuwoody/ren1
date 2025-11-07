"use client";

import { useState, useEffect } from "react";
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
  billing?: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    postcode: string;
    phone: string;
  };
}

export default function DeliveryPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingOrderId, setCompletingOrderId] = useState<number | null>(null);

  // Fetch orders out for delivery
  const fetchOrders = async () => {
    try {
      const response = await fetch("/api/delivery/orders");
      if (!response.ok) {
        throw new Error("Failed to fetch orders");
      }
      const data: Order[] = await response.json();

      console.log(`🚗 Fetched ${data.length} delivery orders`);

      setOrders(data);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching orders:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Mark order as delivered and complete
  const markDelivered = async (orderId: number) => {
    setCompletingOrderId(orderId);
    try {
      const response = await fetch(`/api/update-order/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed", // Order is fully completed when delivered
          meta_data: [
            {
              key: "_delivered_timestamp",
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
      setCompletingOrderId(null);
    }
  };

  // Get time elapsed since marked ready for delivery
  const getDeliveryAge = (order: Order) => {
    const readyTimeMeta = order.meta_data?.find((m) => m.key === "_ready_timestamp");
    if (!readyTimeMeta?.value) return null;

    const readyTime = new Date(readyTimeMeta.value).getTime();
    const now = Date.now();
    const ageMs = now - readyTime;
    const ageMinutes = Math.floor(ageMs / 60000);
    return ageMinutes;
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000); // Poll every 15 seconds
    return () => clearInterval(interval);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300 text-xl">Loading deliveries...</p>
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
                🚗 Delivery Orders
              </h1>
              <p className="text-gray-400 text-lg">
                {orders.length} order{orders.length !== 1 ? "s" : ""} out for delivery
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
              Auto-refresh: 15s
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
            <p className="text-2xl text-gray-400">All deliveries complete!</p>
            <p className="text-gray-500 mt-2">No orders to deliver right now</p>
          </div>
        </div>
      ) : (
        /* Order Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map((order) => {
            const isCompleting = completingOrderId === order.id;
            const deliveryAge = getDeliveryAge(order);

            return (
              <div
                key={order.id}
                className="bg-gray-800 rounded-lg border-4 border-blue-500 p-6 shadow-xl"
              >
                {/* Order Number */}
                <div className="mb-4">
                  <h2 className="text-5xl font-bold text-white mb-1">
                    #{order.number}
                  </h2>
                  <div className="flex items-center justify-between">
                    <p className="text-gray-400 text-sm">Order ID: {order.id}</p>
                    {deliveryAge !== null && (
                      <p className="text-blue-400 text-sm font-semibold">
                        🕐 Ready {deliveryAge}m ago
                      </p>
                    )}
                  </div>
                </div>

                {/* Customer Info */}
                {order.billing && (
                  <div className="mb-4 bg-gray-700 rounded-lg p-3">
                    <h3 className="text-gray-400 text-xs font-semibold mb-2 uppercase">
                      Delivery Address
                    </h3>
                    <p className="text-white font-medium">
                      {order.billing.first_name} {order.billing.last_name}
                    </p>
                    <p className="text-gray-300 text-sm">
                      {order.billing.address_1}
                    </p>
                    {order.billing.address_2 && (
                      <p className="text-gray-300 text-sm">
                        {order.billing.address_2}
                      </p>
                    )}
                    <p className="text-gray-300 text-sm">
                      {order.billing.postcode} {order.billing.city}
                    </p>
                    {order.billing.phone && (
                      <a
                        href={`tel:${order.billing.phone}`}
                        className="text-blue-400 text-sm font-medium mt-1 inline-block"
                      >
                        📞 {order.billing.phone}
                      </a>
                    )}
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
                        <span className="bg-gray-700 text-blue-400 font-bold text-lg px-3 py-1 rounded min-w-[3rem] text-center">
                          {item.quantity}×
                        </span>
                        <span className="text-lg font-medium flex-1 leading-tight pt-1">
                          {item.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Total */}
                <div className="mb-4 text-right">
                  <p className="text-gray-400 text-sm">Total</p>
                  <p className="text-white text-2xl font-bold">RM {order.total}</p>
                </div>

                {/* Mark Delivered Button */}
                <button
                  onClick={() => markDelivered(order.id)}
                  disabled={isCompleting}
                  className={`w-full py-4 rounded-lg font-bold text-xl transition-all ${
                    isCompleting
                      ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-500 active:scale-95"
                  }`}
                >
                  {isCompleting ? "⏳ Updating..." : "✅ Mark Delivered"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
