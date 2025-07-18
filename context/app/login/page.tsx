'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleSubmit() {
    setError('');
    setInfo('');

    if (!email.trim()) {
      setError('Please enter an email or phone.');
      return;
    }

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }), // we now unify on "email"
    });

    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { console.error(text); }

    if (!res.ok) {
      setError('Sign-in failed. Please try again.');
      return;
    }

    const { userId, created } = data;
    if (!userId) {
      setError('Sign-in incomplete: no user id returned.');
      return;
    }

    // Optional client-side mirror (server cookie is what matters)
    localStorage.setItem('userId', String(userId));

    if (created) {
      setInfo('Welcome! Your account was created.');
    } else {
      setInfo('Welcome back!');
    }

    // Short delay so the message flashes, or navigate immediately:
    setTimeout(() => router.push('/orders'), 400);
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Sign In</h1>
      <p className="text-sm text-gray-500">
        Enter your email (or phone). We’ll look you up or create an account automatically.
      </p>
      <input
        type="text"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full p-2 border rounded"
      />
      <button
        onClick={handleSubmit}
        className="w-full bg-green-600 text-white py-2 rounded"
      >
        Continue
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {info && <p className="text-green-600 text-sm">{info}</p>}
      <p className="text-xs text-gray-500 mt-4">
        Want to manage your password? Use the&nbsp;
        <a
          href="https://coffee-oasis.com.my/wp-login.php?action=lostpassword"
          className="text-blue-600 underline"
          target="_blank"
        >
          Woo password reset
        </a>.
      </p>
    </div>
  );
}
