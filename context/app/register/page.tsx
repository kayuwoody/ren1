'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // optional
  const [error, setError] = useState('');

  async function handleRegister() {
    setError('');
    if (!email.trim()) {
      setError('Please enter an email.');
      return;
    }

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'register', email, password }),
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      console.error('Register returned non-JSON:', text);
    }

    if (!res.ok) {
      if (res.status === 409) {
        setError('Account already exists. Please log in.');
      } else {
        setError('Failed to login or register. Please try again.');
      }
      return;
    }

    const { userId } = data;
    if (!userId) {
      setError('Registration incomplete: no user id returned.');
      return;
    }

    localStorage.setItem('userId', String(userId));
    router.push('/orders');
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Register</h1>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full p-2 border rounded"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (optional)"
        className="w-full p-2 border rounded"
      />
      <button
        onClick={handleRegister}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        Register
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <p className="text-sm">
        Already have an account?{' '}
        <a href="/login" className="text-blue-600 underline">
          Login here
        </a>
      </p>
    </div>
  );
}
