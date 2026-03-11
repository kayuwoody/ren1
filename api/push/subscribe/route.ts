import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * POST /api/push/subscribe
 *
 * Store user's push subscription
 * In production, store in database
 * For now, using in-memory storage
 */

// In-memory storage (use database in production)
const subscriptions = new Map<string, any>();

export async function POST(req: Request) {
  try {
    const subscription = await req.json();

    // Get userId from cookie
    const cookieStore = cookies();
    const userIdCookie = cookieStore.get('userId');
    const userId = userIdCookie?.value || 'guest';

    // Store subscription with userId
    subscriptions.set(userId, {
      subscription,
      createdAt: new Date().toISOString()
    });

    console.log(`✅ Push subscription saved for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Push subscription saved'
    });
  } catch (error) {
    return handleApiError(error, '/api/push/subscribe');
  }
}

// Export subscriptions for use by send endpoint
export { subscriptions };
