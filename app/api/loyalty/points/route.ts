import { NextResponse } from 'next/server';
import { getCustomerPoints } from '@/lib/loyaltyService';
import { cookies } from 'next/headers';

/**
 * GET /api/loyalty/points
 *
 * Get current user's loyalty points balance and history
 * Supports both cookie-based auth (for customers) and query param (for admin)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userIdParam = searchParams.get('userId');

    let userId: number;

    // Check for userId in query parameter first (admin use case)
    if (userIdParam) {
      userId = Number(userIdParam);
    } else {
      // Fall back to cookie (customer use case)
      const cookieStore = cookies();
      const userIdCookie = cookieStore.get('userId');

      if (!userIdCookie?.value) {
        return NextResponse.json(
          { error: 'Not authenticated' },
          { status: 401 }
        );
      }

      userId = Number(userIdCookie.value);
    }

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
