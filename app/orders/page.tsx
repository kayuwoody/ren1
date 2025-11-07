'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cartContext';
import { Star, RotateCcw } from 'lucide-react';

export default function OrdersPage() {
  const router = useRouter();
  const { addToCart, clearCart } = useCart();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  // Helper function to check if order timer has completed
  const isOutForDelivery = (order: any) => {
    if (order.status !== 'processing') return false;

    const endTime = order.meta_data?.find((m: any) => m.key === 'endTime')?.value;
    if (!endTime) return false;

    return Date.now() > Number(endTime);
  };

  // Helper function to get status badge
  const getStatusBadge = (order: any) => {
    const status = order.status;

    // Check if it's out for delivery (processing but timer done)
    if (isOutForDelivery(order)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold text-orange-800 bg-orange-100">
          <span>🚚</span>
          <span>Out for Delivery</span>
        </span>
      );
    }

    const badges: Record<string, { icon: string; color: string; bg: string; label: string }> = {
      'pending': { icon: '🟡', color: 'text-yellow-800', bg: 'bg-yellow-100', label: 'Pending' },
      'processing': { icon: '🔵', color: 'text-blue-800', bg: 'bg-blue-100', label: 'Preparing' },
      'ready-for-pickup': { icon: '🟢', color: 'text-green-800', bg: 'bg-green-100', label: 'Ready!' },
      'completed': { icon: '⚪', color: 'text-gray-600', bg: 'bg-gray-100', label: 'Completed' },
    };

    const badge = badges[status] || { icon: '⚫', color: 'text-gray-800', bg: 'bg-gray-100', label: status };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${badge.color} ${badge.bg}`}>
        <span>{badge.icon}</span>
        <span>{badge.label}</span>
      </span>
    );
  };

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('favoriteOrders');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFavorites(new Set(parsed));
      } catch (err) {
        console.error('Failed to load favorites', err);
      }
    }
  }, []);

  // Fetch all orders; server will use userId cookie if present, otherwise guestId fallback
  useEffect(() => {
    setLoading(true);
    fetch('/api/orders')
      .then((res) => res.json())
      .then((data) => {
        setOrders(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('Failed to fetch orders', err);
        setOrders([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Toggle favorite status
  const toggleFavorite = (orderId: number, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation to order details
    e.stopPropagation();

    const newFavorites = new Set(favorites);
    if (newFavorites.has(orderId)) {
      newFavorites.delete(orderId);
    } else {
      newFavorites.add(orderId);
    }
    setFavorites(newFavorites);
    localStorage.setItem('favoriteOrders', JSON.stringify(Array.from(newFavorites)));
  };

  // Quick reorder - add all items from the order to cart
  const handleReorder = async (order: any, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation to order details
    e.stopPropagation();

    if (!confirm(`Reorder ${order.line_items.length} item(s) from Order #${order.id}?`)) {
      return;
    }

    try {
      clearCart();

      for (const item of order.line_items) {
        // Use retail price from metadata if available, otherwise fall back to item price
        const retailPrice = item.meta_data?.find((m: any) => m.key === '_retail_price')?.value;
        const price = retailPrice ? parseFloat(retailPrice) : parseFloat(item.price);

        addToCart({
          productId: item.product_id,
          name: item.name,
          retailPrice: price,
          quantity: item.quantity,
        });
      }

      console.log('✅ Items added to cart from order', order.id);
      alert(`${order.line_items.length} item(s) added to cart!`);
      router.push('/cart');
    } catch (err) {
      console.error('Failed to reorder', err);
      alert('Failed to add items to cart. Please try again.');
    }
  };

  if (loading) {
    return <p className="p-4">Loading orders…</p>;
  }

  // Filter, search, and sort (favorites on top)
  const filtered = orders
    .filter((order) => {
      const matchesStatus =
        statusFilter === 'all' || order.status === statusFilter;
      const matchesSearch =
        order.id.toString().includes(search) ||
        (order.line_items ?? []).some((item: any) =>
          item.name.toLowerCase().includes(search.toLowerCase())
        );
      return matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      // Sort favorites to top
      const aIsFav = favorites.has(a.id);
      const bIsFav = favorites.has(b.id);
      if (aIsFav && !bIsFav) return -1;
      if (!aIsFav && bIsFav) return 1;
      // Otherwise keep original order (newest first)
      return 0;
    });

  return (
    <div className="p-4 max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">My Orders</h1>

      {/* Search and filter controls */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search orders..."
          className="border px-2 py-1 rounded w-full"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border px-2 py-1 rounded"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="ready-for-pickup">Ready</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <p>No orders found.</p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((order) => {
            const isCompleted = order.status === 'completed';
            const dateLabel = order.date_created
              ? new Date(order.date_created).toLocaleDateString()
              : '';

            const isFavorite = favorites.has(order.id);

            return (
              <li
                key={order.id}
                className={`border rounded p-4 transition ${
                  isCompleted ? 'opacity-50' : 'hover:bg-gray-50'
                } ${isFavorite ? 'border-amber-400 border-2 bg-amber-50' : ''}`}
              >
                <Link
                  href={`/orders/${order.id}`}
                  className="block"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-start gap-2">
                      {/* Favorite Star Button */}
                      <button
                        onClick={(e) => toggleFavorite(order.id, e)}
                        className="mt-0.5 hover:scale-110 transition"
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star
                          className={`w-5 h-5 ${
                            isFavorite
                              ? 'fill-amber-500 text-amber-500'
                              : 'text-gray-400 hover:text-amber-500'
                          }`}
                        />
                      </button>
                      <div>
                        <p className="font-semibold">Order #{order.id}</p>
                        <p className="text-xs text-gray-500">
                          {dateLabel}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {(() => {
                        const finalTotal = order.meta_data?.find((m: any) => m.key === '_final_total')?.value;
                        const retailTotal = order.meta_data?.find((m: any) => m.key === '_retail_total')?.value;
                        const totalDiscount = order.meta_data?.find((m: any) => m.key === '_total_discount')?.value;
                        const hasDiscount = totalDiscount && parseFloat(totalDiscount) > 0;

                        return (
                          <>
                            {hasDiscount && (
                              <p className="text-xs text-gray-400 line-through">RM {parseFloat(retailTotal).toFixed(2)}</p>
                            )}
                            <p className={`font-bold ${hasDiscount ? 'text-green-600' : ''}`}>
                              RM {finalTotal ? parseFloat(finalTotal).toFixed(2) : (order.total ?? '—')}
                            </p>
                          </>
                        );
                      })()}
                      {order.line_items?.length ? (
                        <p className="text-xs text-gray-500">
                          {order.line_items.length} item
                          {order.line_items.length > 1 ? 's' : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {getStatusBadge(order)}

                    {/* Reorder Button */}
                    <button
                      onClick={(e) => handleReorder(order, e)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded transition"
                      title="Reorder these items"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reorder</span>
                    </button>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
