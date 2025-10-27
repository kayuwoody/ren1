'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Star, TrendingUp, Gift, Search, Award } from 'lucide-react';

interface Customer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  billing?: {
    phone?: string;
  };
}

interface PointsTransaction {
  id: string;
  type: 'earned' | 'redeemed';
  amount: number;
  reason: string;
  orderId?: string;
  timestamp: string;
}

interface LoyaltyPoints {
  balance: number;
  history: PointsTransaction[];
}

export default function AdminLoyaltyPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [points, setPoints] = useState<LoyaltyPoints | null>(null);
  const [loading, setLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [awardAmount, setAwardAmount] = useState('');
  const [awardReason, setAwardReason] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (customerSearch) {
      const filtered = customers.filter(c =>
        c.email.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.first_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.last_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.billing?.phone?.includes(customerSearch)
      );
      setFilteredCustomers(filtered);
    } else {
      setFilteredCustomers(customers);
    }
  }, [customerSearch, customers]);

  const fetchCustomers = async () => {
    try {
      // Fetch customers from WooCommerce
      const res = await fetch('/api/admin/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
        setFilteredCustomers(data);
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    }
  };

  const fetchCustomerPoints = async (customerId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/loyalty/points?userId=${customerId}`);
      if (res.ok) {
        const data = await res.json();
        setPoints(data);
      }
    } catch (err) {
      console.error('Failed to fetch points:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    fetchCustomerPoints(customer.id);
  };

  const handleAwardPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !awardAmount || !awardReason) return;

    try {
      const res = await fetch('/api/loyalty/award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedCustomer.id,
          amount: parseInt(awardAmount),
          reason: awardReason,
        }),
      });

      if (res.ok) {
        alert('Points awarded successfully!');
        setAwardAmount('');
        setAwardReason('');
        fetchCustomerPoints(selectedCustomer.id);
      } else {
        alert('Failed to award points');
      }
    } catch (err) {
      console.error('Failed to award points:', err);
      alert('Error awarding points');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Star className="w-7 h-7 text-yellow-500" />
                Loyalty Points Management
              </h1>
              <p className="text-sm text-gray-500">View and manage customer loyalty points</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-120px)]">
        {/* Customer List Sidebar */}
        <div className="w-80 bg-white border-r flex flex-col">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p>No customers found</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    className={`w-full text-left p-4 hover:bg-gray-50 transition ${
                      selectedCustomer?.id === customer.id ? 'bg-yellow-50 border-l-4 border-yellow-500' : ''
                    }`}
                  >
                    <div className="font-medium">
                      {customer.first_name} {customer.last_name}
                    </div>
                    <div className="text-sm text-gray-600">{customer.email}</div>
                    {customer.billing?.phone && (
                      <div className="text-xs text-gray-500">{customer.billing.phone}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedCustomer ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Star className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>Select a customer to view their loyalty points</p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading points...</p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Customer Header */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold mb-2">
                  {selectedCustomer.first_name} {selectedCustomer.last_name}
                </h2>
                <p className="text-gray-600">{selectedCustomer.email}</p>
              </div>

              {/* Points Balance */}
              <div className="bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-lg shadow-lg p-8 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-yellow-100 text-sm uppercase tracking-wide mb-2">Current Balance</p>
                    <p className="text-5xl font-bold">{points?.balance || 0}</p>
                    <p className="text-yellow-100 mt-2">points</p>
                  </div>
                  <Award className="w-24 h-24 text-yellow-200 opacity-50" />
                </div>
                <div className="mt-4 pt-4 border-t border-yellow-300">
                  <p className="text-sm text-yellow-100">
                    Worth approximately RM {((points?.balance || 0) / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Award Points Form */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-yellow-600" />
                  Award Points
                </h3>
                <form onSubmit={handleAwardPoints} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Points Amount
                      </label>
                      <input
                        type="number"
                        value={awardAmount}
                        onChange={(e) => setAwardAmount(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500"
                        placeholder="e.g., 50"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Reason
                      </label>
                      <input
                        type="text"
                        value={awardReason}
                        onChange={(e) => setAwardReason(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500"
                        placeholder="e.g., Birthday bonus"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-yellow-500 text-white py-2 rounded-lg hover:bg-yellow-600 transition font-medium"
                  >
                    Award Points
                  </button>
                </form>
              </div>

              {/* Points History */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-gray-600" />
                    Points History
                  </h3>
                </div>
                <div className="divide-y">
                  {!points || points.history.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <p>No transaction history</p>
                    </div>
                  ) : (
                    points.history.map((transaction) => (
                      <div key={transaction.id} className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{transaction.reason}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(transaction.timestamp).toLocaleDateString('en-MY', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {transaction.orderId && (
                            <p className="text-xs text-gray-400">Order #{transaction.orderId}</p>
                          )}
                        </div>
                        <div
                          className={`text-lg font-bold ${
                            transaction.type === 'earned' ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {transaction.type === 'earned' ? '+' : '-'}
                          {transaction.amount}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
