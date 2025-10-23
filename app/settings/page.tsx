'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, LogOut, FileText, Settings as SettingsIcon } from 'lucide-react';

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

  useEffect(() => {
    // Load user info from localStorage
    const storedUserId = localStorage.getItem('userId');
    const storedEmail = localStorage.getItem('userEmail');
    setUserId(storedUserId);
    setEmail(storedEmail);
  }, []);

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

      {/* Navigation Links */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
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
