'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOrFindWooCustomer } from '@/lib/customerService'; // adjust path

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    const storedId = localStorage.getItem('clientId');
    if (storedId) {
      setClientId(storedId);
      const savedProfile = localStorage.getItem(`profile-${storedId}`);
      if (savedProfile) {
        setForm(JSON.parse(savedProfile));
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const generatedId = clientId || crypto.randomUUID();
  localStorage.setItem('clientId', generatedId);
  localStorage.setItem(`profile-${generatedId}`, JSON.stringify(form));

  try {
    const res = await fetch('/api/register-or-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, clientId: generatedId }),
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('wooCustomerId', data.customer_id); // Optional but useful
    } else {
      console.warn('Failed to register or lookup WooCommerce customer');
    }
  } catch (err) {
    console.error('Error registering customer:', err);
  }

  router.push('/');
};

  if (clientId) {
    return (
      <div className="p-4 max-w-xl mx-auto space-y-4">
        <p className="text-green-600">You’re already logged in as <strong>{clientId}</strong></p>

        <div className="space-y-2">
          <h2 className="text-xl font-bold">Profile</h2>
          <input
            type="text"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border px-2 py-1 rounded w-full"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border px-2 py-1 rounded w-full"
          />
          <input
            type="tel"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="border px-2 py-1 rounded w-full"
          />
          <input
            type="text"
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="border px-2 py-1 rounded w-full"
          />
          <button
            onClick={() => {
              localStorage.setItem(`profile-${clientId}`, JSON.stringify(form));
              alert('Profile updated');
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Save Profile
          </button>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => {
              localStorage.removeItem('clientId');
              location.reload();
            }}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            Logout
          </button>

          <button
            onClick={() => router.push('/orders')}
            className="bg-gray-800 text-white px-4 py-2 rounded"
          >
            View My Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{mode === 'login' ? 'Login' : 'Register'}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <>
            <input
              type="text"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border px-2 py-1 rounded w-full"
            />
            <input
              type="text"
              placeholder="Address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="border px-2 py-1 rounded w-full"
            />
          </>
        )}
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="border px-2 py-1 rounded w-full"
        />
        <input
          type="tel"
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="border px-2 py-1 rounded w-full"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
          {mode === 'login' ? 'Login' : 'Register'}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        {mode === 'login' ? 'Don’t have an account?' : 'Already have an account?'}{' '}
        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="text-blue-600 hover:underline"
        >
          {mode === 'login' ? 'Register here' : 'Login here'}
        </button>
      </p>
    </div>
  );
}
