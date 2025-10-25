import { NextResponse } from 'next/server';
import { awardPoints, POINTS_CONFIG } from '@/lib/loyaltyService';
import { cookies } from 'next/headers';

/**
 * POST /api/loyalty/award
 *
 * Award loyalty points to user
 *
 * Body:
 * {
 *   "reason": "manual_pickup",
 *   "orderId": "123"
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reason, orderId, userId: bodyUserId } = body;

    // Try to get userId from cookie first, then from request body, then from localStorage (via header)
    const cookieStore = cookies();
    const userIdCookie = cookieStore.get('userId');
    const userIdFromHeader = req.headers.get('x-user-id');

    const userId = bodyUserId ||
                   (userIdCookie?.value ? Number(userIdCookie.value) : null) ||
                   (userIdFromHeader ? Number(userIdFromHeader) : null);

    if (!userId) {
      // If no userId provided, still succeed but don't award points (guest user)
      console.warn('⚠️ No userId found - guest user, skipping points award');
      return NextResponse.json({
        success: true,
        awarded: 0,
        balance: 0,
        message: 'Order completed (guest user - no points awarded)'
      });
    }

    // Determine points amount based on reason
    let amount = 0;
    let description = '';

    switch (reason) {
      case 'manual_pickup':
        amount = POINTS_CONFIG.MANUAL_PICKUP;
        description = 'Manual pickup confirmation';
        break;
      case 'order_completed':
        amount = POINTS_CONFIG.ORDER_COMPLETED;
        description = 'Order completed';
        break;
      case 'first_order':
        amount = POINTS_CONFIG.FIRST_ORDER;
        description = 'First order bonus';
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid reason' },
          { status: 400 }
        );
    }

    // Award points
    const points = await awardPoints(userId, amount, description, orderId);

    return NextResponse.json({
      success: true,
      awarded: amount,
      balance: points.balance,
      message: `+${amount} points earned! ${description}`
    });
  } catch (err: any) {
    console.error('❌ Failed to award points:', err);
    return NextResponse.json(
      { error: 'Failed to award points', detail: err.message },
      { status: 500 }
    );
  }
}
