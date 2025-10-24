import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { subscriptions } from '../subscribe/route';

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
  } catch (err: any) {
    console.error('❌ Failed to remove push subscription:', err);
    return NextResponse.json(
      { error: 'Failed to remove subscription', detail: err.message },
      { status: 500 }
    );
  }
}
