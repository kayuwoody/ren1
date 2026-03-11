import { NextResponse } from 'next/server';
import { getCustomerPoints } from '@/lib/loyaltyService';
import { cookies } from 'next/headers';
import { handleApiError, unauthorizedError } from '@/lib/api/error-handler';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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
        return unauthorizedError('Not authenticated', '/api/loyalty/points');
      }

      userId = Number(userIdCookie.value);
    }

    const points = await getCustomerPoints(userId);

    return NextResponse.json(points);
  } catch (error) {
    return handleApiError(error, '/api/loyalty/points');
  }
}
