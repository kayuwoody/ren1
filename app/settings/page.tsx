'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, LogOut, FileText, Settings as SettingsIcon, Award, TrendingUp, Bell, BellOff } from 'lucide-react';
import {
  isPushNotificationSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  isSubscribedToPush
} from '@/lib/pushNotifications';

interface PointsTransaction {
  id: string;
  type: 'earned' | 'redeemed';
  amount: number;
  reason: string;
  orderId?: string;
  timestamp: string;
}

/**
 * Settings Page
 *
 * Central hub for user account management and app settings
 * Accessible via Settings icon in persistent navigation
 *
 * Features:
 * - User profile display
 * - Order history access
 * - Logout functionality
 * - Account management
 */
export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [pointsBalance, setPointsBalance] = useState<number>(0);
  const [pointsHistory, setPointsHistory] = useState<PointsTransaction[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    // Load user info from localStorage
    const storedUserId = localStorage.getItem('userId');
    const storedEmail = localStorage.getItem('userEmail');
    setUserId(storedUserId);
    setEmail(storedEmail);

    // Fetch loyalty points if logged in
    if (storedUserId) {
      fetchPoints();
    }

    // Check push notification support and status
    if (typeof window !== 'undefined') {
      setPushSupported(isPushNotificationSupported());
      checkPushSubscription();
    }
  }, []);

  const checkPushSubscription = async () => {
    try {
      const subscribed = await isSubscribedToPush();
      setPushSubscribed(subscribed);
    } catch (err) {
      console.error('Failed to check push subscription:', err);
    }
  };

  const fetchPoints = async () => {
    setLoadingPoints(true);
    try {
      const res = await fetch('/api/loyalty/points');
      if (res.ok) {
        const data = await res.json();
        setPointsBalance(data.balance);
        setPointsHistory(data.history);
      }
    } catch (err) {
      console.error('Failed to fetch points:', err);
    } finally {
      setLoadingPoints(false);
    }
  };

  const handlePushToggle = async () => {
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        // Unsubscribe
        await unsubscribeFromPushNotifications();
        setPushSubscribed(false);
        alert('Push notifications disabled');
      } else {
        // Subscribe
        await subscribeToPushNotifications();
        setPushSubscribed(true);
        alert('Push notifications enabled! You\'ll be notified when your order is ready.');
      }
    } catch (err: any) {
      console.error('Push toggle failed:', err);
      alert(`Failed to ${pushSubscribed ? 'disable' : 'enable'} notifications: ${err.message}`);
    } finally {
      setPushLoading(false);
    }
  };

  const handleLogout = () => {
    // Clear all user data
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('clientId');
    localStorage.removeItem('currentWooId');

    // Redirect to menu
    router.push('/products');
  };

  const isLoggedIn = !!userId;

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="w-8 h-8 text-gray-700" />
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      {/* Loyalty Points Section */}
      {isLoggedIn && (
        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg shadow-md p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-orange-200">
            <Award className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-semibold">Loyalty Points</h2>
          </div>

          {loadingPoints ? (
            <p className="text-gray-600">Loading...</p>
          ) : (
            <>
              <div className="bg-white rounded-lg p-6 text-center">
                <p className="text-sm text-gray-500 mb-2">Your Balance</p>
                <p className="text-5xl font-bold text-orange-600">{pointsBalance}</p>
                <p className="text-sm text-gray-500 mt-2">
                  Worth RM {(pointsBalance / 100).toFixed(2)}
                </p>
              </div>

              {pointsHistory.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <TrendingUp className="w-4 h-4" />
                    <p className="font-semibold">Recent Activity</p>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {pointsHistory.slice(0, 10).map((txn) => (
                      <div key={txn.id} className="bg-white rounded p-3 flex justify-between items-center text-sm">
                        <div>
                          <p className="font-medium text-gray-800">{txn.reason}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(txn.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`font-bold ${txn.type === 'earned' ? 'text-green-600' : 'text-red-600'}`}>
                          {txn.type === 'earned' ? '+' : '-'}{txn.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg p-4 text-sm text-gray-600">
                <p className="font-semibold mb-2">How to earn points:</p>
                <ul className="space-y-1">
                  <li>• +10 points: Confirm pickup manually</li>
                  <li>• +5 points: Complete an order</li>
                  <li>• +20 points: First order bonus</li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* User Profile Section */}
      <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b">
          <User className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Profile</h2>
        </div>

        {isLoggedIn ? (
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">User ID</p>
              <p className="font-mono text-gray-800">{userId}</p>
            </div>
            {email && (
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="text-gray-800">{email}</p>
              </div>
            )}
            <div className="pt-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                ✓ Logged In
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-600">You're not logged in</p>
            <Link
              href="/login"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Login or Register
            </Link>
          </div>
        )}
      </div>

      {/* Push Notifications Section */}
      {pushSupported && isLoggedIn && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 pb-3 border-b mb-4">
            <Bell className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-semibold">Notifications</h2>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-semibold text-gray-800">Push Notifications</p>
              <p className="text-sm text-gray-500 mt-1">
                Get notified when your order is ready for pickup
              </p>
            </div>

            <button
              onClick={handlePushToggle}
              disabled={pushLoading}
              className={`ml-4 px-4 py-2 rounded-lg font-semibold transition ${
                pushSubscribed
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } disabled:opacity-50`}
            >
              {pushLoading ? (
                'Loading...'
              ) : pushSubscribed ? (
                <span className="flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Enabled
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <BellOff className="w-4 h-4" />
                  Disabled
                </span>
              )}
            </button>
          </div>

          {pushSubscribed && (
            <div className="mt-4 p-3 bg-purple-50 rounded-lg text-sm text-purple-800">
              ✓ You'll receive notifications when your orders are ready
            </div>
          )}
        </div>
      )}

      {/* Navigation Links */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <Link
          href="/customer"
          className="flex items-center gap-3 p-4 hover:bg-gray-50 transition border-b"
        >
          <User className="w-5 h-5 text-amber-600" />
          <div className="flex-1">
            <p className="font-semibold">Quick Reorder</p>
            <p className="text-sm text-gray-500">Reorder from your history</p>
          </div>
          <span className="text-gray-400">→</span>
        </Link>

        <Link
          href="/orders"
          className="flex items-center gap-3 p-4 hover:bg-gray-50 transition border-b"
        >
          <FileText className="w-5 h-5 text-gray-600" />
          <div className="flex-1">
            <p className="font-semibold">Order History</p>
            <p className="text-sm text-gray-500">View all your orders</p>
          </div>
          <span className="text-gray-400">→</span>
        </Link>

        {isLoggedIn && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 p-4 hover:bg-red-50 transition w-full text-left"
          >
            <LogOut className="w-5 h-5 text-red-600" />
            <div className="flex-1">
              <p className="font-semibold text-red-600">Logout</p>
              <p className="text-sm text-gray-500">Sign out of your account</p>
            </div>
          </button>
        )}
      </div>

      {/* App Info */}
      <div className="text-center text-sm text-gray-500 pt-4">
        <p>Coffee Oasis POS</p>
        <p>Version 2.0.0</p>
      </div>
    </div>
  );
}
