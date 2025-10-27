'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Package, Lock, Activity, AlertTriangle, Printer, DollarSign, BarChart3 } from 'lucide-react';
import Link from 'next/link';

/**
 * Admin Dashboard
 *
 * Staff-only dashboard for monitoring system health
 * Separate from customer-facing app
 *
 * Features:
 * - Locker status monitoring
 * - Order management panel
 * - System health overview
 * - Real-time updates
 *
 * Authentication:
 * - Simple password protection for now
 * - Can be upgraded to full auth system later
 */

interface LockerStatus {
  lockerId: string;
  status: string;
  battery: number;
  occupiedSlots: string[];
  freeSlots: string[];
  temperature?: number;
  lastSeen: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [lockers, setLockers] = useState<LockerStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if already authenticated
    const authToken = sessionStorage.getItem('admin_auth');
    if (authToken === 'authenticated') {
      setIsAuthenticated(true);
      fetchLockerStatus();
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    // Simple password check (use env variable in production)
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';

    if (password === adminPassword) {
      sessionStorage.setItem('admin_auth', 'authenticated');
      setIsAuthenticated(true);
      setError('');
      fetchLockerStatus();
    } else {
      setError('Invalid password');
    }
  };

  const fetchLockerStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/locker/heartbeat');
      if (res.ok) {
        const data = await res.json();
        setLockers(data.lockers || []);
      }
    } catch (err) {
      console.error('Failed to fetch locker status:', err);
    } finally {
      setLoading(false);
    }
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold">Admin Access</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Login
            </button>
          </form>

          <div className="mt-6 text-sm text-gray-500 text-center">
            <p>Staff access only</p>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Screen
  const onlineLockers = lockers.filter(l => l.status !== 'offline').length;
  const offlineLockers = lockers.filter(l => l.status === 'offline').length;
  const totalSlots = lockers.reduce((sum, l) => sum + (l.occupiedSlots?.length || 0) + (l.freeSlots?.length || 0), 0);
  const occupiedSlots = lockers.reduce((sum, l) => sum + (l.occupiedSlots?.length || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">Coffee Oasis POS</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchLockerStatus}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm"
            >
              Refresh
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem('admin_auth');
                setIsAuthenticated(false);
              }}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-500">Online Lockers</p>
                <p className="text-2xl font-bold text-green-600">{onlineLockers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-sm text-gray-500">Offline Lockers</p>
                <p className="text-2xl font-bold text-red-600">{offlineLockers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <Lock className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-500">Occupied Slots</p>
                <p className="text-2xl font-bold text-blue-600">{occupiedSlots}/{totalSlots}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm text-gray-500">Total Lockers</p>
                <p className="text-2xl font-bold text-purple-600">{lockers.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <Link
            href="/admin/lockers"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <div className="flex items-center gap-3 mb-2">
              <Lock className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold">Locker Monitoring</h2>
            </div>
            <p className="text-gray-600">View detailed status of all smart lockers</p>
          </Link>

          <Link
            href="/admin/orders"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-6 h-6 text-purple-600" />
              <h2 className="text-xl font-semibold">Order Management</h2>
            </div>
            <p className="text-gray-600">Monitor and manage all orders</p>
          </Link>

          <Link
            href="/admin/analytics"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-6 h-6 text-indigo-600" />
              <h2 className="text-xl font-semibold">Analytics & Insights</h2>
            </div>
            <p className="text-gray-600">Profitability trends and business insights</p>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/admin/costs"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-6 h-6 text-orange-600" />
              <h2 className="text-xl font-semibold">Product Costs</h2>
            </div>
            <p className="text-gray-600">Manage COGS and profit margins</p>
          </Link>

          <Link
            href="/admin/printers"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <div className="flex items-center gap-3 mb-2">
              <Printer className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-semibold">Printer Setup</h2>
            </div>
            <p className="text-gray-600">Configure thermal printers for receipts</p>
          </Link>
        </div>

        {/* Locker Status Quick View */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">Locker Status Overview</h2>
          </div>

          {loading ? (
            <div className="p-6">Loading...</div>
          ) : lockers.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p>No locker data available</p>
              <p className="text-sm mt-2">Lockers will appear here once they send their first heartbeat</p>
            </div>
          ) : (
            <div className="divide-y">
              {lockers.map((locker) => {
                const isOffline = locker.status === 'offline';
                const hoursSinceLastSeen = locker.lastSeen
                  ? (Date.now() - new Date(locker.lastSeen).getTime()) / (1000 * 60 * 60)
                  : null;

                return (
                  <div key={locker.lockerId} className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500'}`} />
                      <div>
                        <h3 className="font-semibold">{locker.lockerId}</h3>
                        <p className="text-sm text-gray-500">
                          {isOffline ? 'Offline' : 'Online'} •
                          Last seen: {hoursSinceLastSeen !== null ? `${hoursSinceLastSeen.toFixed(1)}h ago` : 'Unknown'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <p className="text-gray-500">Occupied</p>
                        <p className="font-semibold">{locker.occupiedSlots?.length || 0}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Free</p>
                        <p className="font-semibold">{locker.freeSlots?.length || 0}</p>
                      </div>
                      {locker.temperature && (
                        <div>
                          <p className="text-gray-500">Temp</p>
                          <p className="font-semibold">{locker.temperature}°C</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
