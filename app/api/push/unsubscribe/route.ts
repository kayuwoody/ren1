import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { subscriptions } from '../subscribe/route';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * POST /api/push/unsubscribe
 *
 * Remove user's push subscription
 */
export async function POST(req: Request) {
  try {
    // Get userId from cookie
    const cookieStore = cookies();
    const userIdCookie = cookieStore.get('userId');
    const userId = userIdCookie?.value || 'guest';

    // Remove subscription
    subscriptions.delete(userId);

    console.log(`✅ Push subscription removed for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Push subscription removed'
    });
  } catch (error) {
    return handleApiError(error, '/api/push/unsubscribe');
  }
}
