'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Home Page - Redirects to Menu
 *
 * Since Menu (/products) is now the primary landing page,
 * this page simply redirects users there.
 *
 * UX Decision: Menu-first approach for a coffee shop POS
 * - Faster ordering for customers
 * - Primary action is browsing/ordering
 * - Settings accessible via persistent nav icon
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to menu (products page) as default landing
    router.replace('/products');
  }, [router]);

  // Show loading state during redirect
  return (
    <main className="max-w-xl mx-auto p-6 flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading menu...</p>
      </div>
    </main>
  );
}
