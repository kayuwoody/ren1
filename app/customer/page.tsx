'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Phone, Star, Clock, ShoppingCart, ArrowRight } from 'lucide-react';
import { useCart } from '@/context/cartContext';

export default function CustomerLookupPage() {
  const router = useRouter();
  const { addToCart, clearCart } = useCart();
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLookup = async () => {
    if (!phone) {
      setError('Please enter a phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Search for customer by phone in WooCommerce
      const res = await fetch(`/api/customers/search?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();

      if (data.customer) {
        setCustomer(data.customer);

        // Get customer's recent orders
        const ordersRes = await fetch(`/api/orders?customer=${data.customer.id}&per_page=5`);
        const ordersData = await ordersRes.json();
        setRecentOrders(ordersData.slice(0, 5));

        // Save to session
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('current_customer', JSON.stringify(data.customer));
        }
      } else {
        // New customer - offer to create profile
        setCustomer(null);
        setError('Customer not found. You can continue as guest or create a profile.');
      }
    } catch (err) {
      console.error('Failed to lookup customer:', err);
      setError('Failed to lookup customer');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickReorder = async (order: any) => {
    // Clear current cart
    clearCart();

    // Add all items from the order to cart
    for (const item of order.line_items) {
      addToCart({
        productId: item.product_id,
        name: item.name,
        retailPrice: parseFloat(item.price),
        quantity: item.quantity,
      });
    }

    // Redirect to cart
    router.push('/cart');
  };

  const handleContinueAsGuest = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('current_customer');
    }
    router.push('/products');
  };

  const handleContinueWithCustomer = () => {
    router.push('/products');
  };

  // Calculate points info
  const pointsBalance = customer?.meta_data?.find((m: any) => m.key === '_loyalty_points')?.value || 0;
  const pointsValue = Math.floor(Number(pointsBalance) / 100); // 100 points = RM1

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center pt-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-600 to-amber-800 rounded-full mb-4">
            <User className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome Back!</h1>
          <p className="text-gray-600">Returning customer? Get your rewards & quick reorder</p>
        </div>

        {/* Phone Lookup */}
        {!customer && (
          <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="w-4 h-4 inline mr-1" />
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
                placeholder="+60 12-345-6789"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              onClick={handleLookup}
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Looking up...' : 'Find My Account'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or</span>
              </div>
            </div>

            <button
              onClick={handleContinueAsGuest}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg transition"
            >
              Continue as Guest
            </button>
          </div>
        )}

        {/* Customer Info & Actions */}
        {customer && (
          <div className="space-y-4">
            {/* Customer Profile */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    {customer.first_name || 'Customer'} {customer.last_name || ''}
                  </h2>
                  <p className="text-sm text-gray-600">{customer.billing?.phone || phone}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-amber-600">
                    <Star className="w-5 h-5 fill-current" />
                    <span className="text-2xl font-bold">{pointsBalance}</span>
                  </div>
                  <p className="text-xs text-gray-500">points</p>
                  {pointsValue > 0 && (
                    <p className="text-xs text-green-600 font-medium">H RM{pointsValue} value</p>
                  )}
                </div>
              </div>

              <button
                onClick={handleContinueWithCustomer}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
              >
                Start New Order
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            {/* Recent Orders & Quick Reorder */}
            {recentOrders.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  Recent Orders
                </h3>

                <div className="space-y-3">
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-amber-300 transition"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            Order #{order.id}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(order.date_created).toLocaleDateString('en-MY')}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-gray-800">
                          RM {order.total}
                        </p>
                      </div>

                      <div className="text-xs text-gray-600 mb-3">
                        {order.line_items.slice(0, 2).map((item: any, idx: number) => (
                          <div key={idx}>
                            {item.quantity}x {item.name}
                          </div>
                        ))}
                        {order.line_items.length > 2 && (
                          <div className="text-gray-400">
                            +{order.line_items.length - 2} more items
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleQuickReorder(order)}
                        className="w-full bg-gray-100 hover:bg-amber-100 text-amber-700 font-medium py-2 px-3 rounded-lg transition text-sm flex items-center justify-center gap-2"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Reorder This
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Change Customer */}
            <button
              onClick={() => {
                setCustomer(null);
                setRecentOrders([]);
                setPhone('');
              }}
              className="w-full text-center text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Not you? Switch account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
