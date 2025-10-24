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
    const body = await req.json();
    const { reason, orderId } = body;

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
