'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    setClientId(localStorage.getItem('clientId'));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('clientId');
    location.reload();
  };

  return (
    <main className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Welcome to Coffee Oasis</h1>

      {clientId ? (
        <div className="space-y-2">
          <p className="text-green-600">Logged in as <strong>{clientId}</strong></p>
          <div className="flex gap-4">
            <Link href="/orders" className="text-blue-600 hover:underline">My Orders</Link>
            <button onClick={handleLogout} className="text-red-500 hover:underline">Logout</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p>You’re not logged in.</p>
          <Link href="/login" className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Login or Register
          </Link>
        </div>
      )}

      <div>
        <Link
          href="/products"
          className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          View Menu
        </Link>
      </div>
    </main>
  );
}
