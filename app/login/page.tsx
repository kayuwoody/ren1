'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const storedId = localStorage.getItem('clientId');
    if (storedId) {
      setClientId(storedId);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/register-or-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error('❌ Not JSON:', text);
        throw new Error('Invalid JSON');
      }

      if (data.clientId) {
        localStorage.setItem('clientId', data.clientId);
        if (data.wooCustomerId) {
          localStorage.setItem('wooCustomerId', String(data.wooCustomerId));
        }
        setClientId(data.clientId);
        router.push('/');
      } else {
        throw new Error('No clientId returned');
      }
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError('Failed to login or register. Please try again.');
    }
  };

  if (clientId) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <p className="text-green-600">
          You’re already logged in as <strong>{clientId}</strong>
        </p>
        <button
          onClick={() => {
            localStorage.removeItem('clientId');
            localStorage.removeItem('wooCustomerId');
            location.reload();
          }}
          className="mt-4 bg-red-600 text-white px-4 py-2 rounded"
        >
          Logout
        </button>
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
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
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
