import { NextResponse } from 'next/server';
import { getCustomerPoints } from '@/lib/loyaltyService';
import { cookies } from 'next/headers';

/**
 * GET /api/loyalty/points
 *
 * Get current user's loyalty points balance and history
 */
export async function GET(req: Request) {
  try {
    // Get userId from cookie
    const cookieStore = cookies();
    const userIdCookie = cookieStore.get('userId');

    if (!userIdCookie?.value) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = Number(userIdCookie.value);
    const points = await getCustomerPoints(userId);

    return NextResponse.json(points);
  } catch (err: any) {
    console.error('❌ Failed to fetch points:', err);
    return NextResponse.json(
      { error: 'Failed to fetch points', detail: err.message },
      { status: 500 }
    );
  }
}
