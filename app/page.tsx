'use client';
import React from 'react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="p-4 text-center">
      <h1 className="text-3xl font-bold mb-4">Welcome to the Coffee POS App</h1>
      <p>This is a placeholder homepage.</p>
      <Link href="/products" className="text-blue-600 underline">
        View Products
      </Link>
    </div>
  );
}
