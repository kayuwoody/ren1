'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [error, setError] = useState('');

  const handleRegister = () => {
    if (!form.email && !form.phone) {
      return setError('Please enter either email or phone');
    }

    const clientId = form.email || form.phone;
    localStorage.setItem('clientId', clientId);
    router.push('/');
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Register</h1>
      <input
        type="text"
        placeholder="Name (optional)"
        className="w-full border px-3 py-2 rounded"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        type="text"
        placeholder="Email (optional)"
        className="w-full border px-3 py-2 rounded"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <input
        type="text"
        placeholder="Phone (optional)"
        className="w-full border px-3 py-2 rounded"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <input
        type="text"
        placeholder="Address (optional)"
        className="w-full border px-3 py-2 rounded"
        value={form.address}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        onClick={handleRegister}
        className="w-full bg-green-600 text-white py-2 rounded"
      >
        Create Account
      </button>
    </div>
  );
}
