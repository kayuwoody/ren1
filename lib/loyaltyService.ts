import { wcApi } from './wooClient';

/**
 * Loyalty Points Service
 *
 * Manages customer loyalty points stored in WooCommerce customer meta_data
 *
 * Point Awards:
 * - 10 points: Manual pickup confirmation ("I Picked It Up")
 * - 5 points: Per order completed
 * - Future: Birthday bonus, referral rewards, etc.
 *
 * Point Redemption (future):
 * - 100 points = RM 1 discount
 * - Special items unlock at certain point thresholds
 */

export interface PointsTransaction {
  id: string;
  type: 'earned' | 'redeemed';
  amount: number;
  reason: string;
  orderId?: string;
  timestamp: string;
}

export interface LoyaltyPoints {
  balance: number;
  history: PointsTransaction[];
}

/**
 * Get customer's current points balance and history
 */
export async function getCustomerPoints(userId: number): Promise<LoyaltyPoints> {
  try {
    const { data: customer } = await wcApi.get(`customers/${userId}`);

    // Extract points from meta_data
    const pointsBalance = customer.meta_data?.find((m: any) => m.key === '_loyalty_points')?.value || 0;
    const pointsHistory = customer.meta_data?.find((m: any) => m.key === '_loyalty_history')?.value || '[]';

    return {
      balance: Number(pointsBalance),
      history: JSON.parse(pointsHistory)
    };
  } catch (err: any) {
    console.error('❌ Failed to get customer points:', err);
    return { balance: 0, history: [] };
  }
}

/**
 * Award points to customer
 */
export async function awardPoints(
  userId: number,
  amount: number,
  reason: string,
  orderId?: string
): Promise<LoyaltyPoints> {
  try {
    // 1. Get current points
    const current = await getCustomerPoints(userId);

    // 2. Calculate new balance
    const newBalance = current.balance + amount;

    // 3. Add transaction to history
    const transaction: PointsTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'earned',
      amount,
      reason,
      orderId: orderId ? String(orderId) : undefined,
      timestamp: new Date().toISOString()
    };

    const newHistory = [transaction, ...current.history].slice(0, 100); // Keep last 100 transactions

    // 4. Update customer meta_data
    const { data: customer } = await wcApi.get(`customers/${userId}`);
    const existingMeta = customer.meta_data || [];

    // Remove old points/history entries
    const filteredMeta = existingMeta.filter((m: any) =>
      m.key !== '_loyalty_points' && m.key !== '_loyalty_history'
    );

    // Add new points/history
    const updatedMeta = [
      ...filteredMeta,
      { key: '_loyalty_points', value: String(newBalance) },
      { key: '_loyalty_history', value: JSON.stringify(newHistory) }
    ];

    await wcApi.put(`customers/${userId}`, {
      meta_data: updatedMeta
    });

    console.log(`✅ Awarded ${amount} points to customer #${userId}: ${reason}`);

    return {
      balance: newBalance,
      history: newHistory
    };
  } catch (err: any) {
    console.error('❌ Failed to award points:', err);
    throw err;
  }
}

/**
 * Redeem points (future feature)
 */
export async function redeemPoints(
  userId: number,
  amount: number,
  reason: string,
  orderId?: string
): Promise<LoyaltyPoints> {
  try {
    const current = await getCustomerPoints(userId);

    if (current.balance < amount) {
      throw new Error('Insufficient points balance');
    }

    const newBalance = current.balance - amount;

    const transaction: PointsTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'redeemed',
      amount,
      reason,
      orderId: orderId ? String(orderId) : undefined,
      timestamp: new Date().toISOString()
    };

    const newHistory = [transaction, ...current.history].slice(0, 100);

    const { data: customer } = await wcApi.get(`customers/${userId}`);
    const existingMeta = customer.meta_data || [];

    const filteredMeta = existingMeta.filter((m: any) =>
      m.key !== '_loyalty_points' && m.key !== '_loyalty_history'
    );

    const updatedMeta = [
      ...filteredMeta,
      { key: '_loyalty_points', value: String(newBalance) },
      { key: '_loyalty_history', value: JSON.stringify(newHistory) }
    ];

    await wcApi.put(`customers/${userId}`, {
      meta_data: updatedMeta
    });

    console.log(`✅ Redeemed ${amount} points from customer #${userId}: ${reason}`);

    return {
      balance: newBalance,
      history: newHistory
    };
  } catch (err: any) {
    console.error('❌ Failed to redeem points:', err);
    throw err;
  }
}

/**
 * Point award constants
 */
export const POINTS_CONFIG = {
  MANUAL_PICKUP: 10,        // Confirming "I Picked It Up"
  ORDER_COMPLETED: 5,       // Any order completion
  FIRST_ORDER: 20,          // First order bonus
  BIRTHDAY: 50,             // Birthday bonus (future)
  REFERRAL: 25,             // Referring a friend (future)
  REVIEW_PRODUCT: 15,       // Writing a review (future)
};

/**
 * Calculate point value in currency
 * 100 points = RM 1
 */
export function pointsToRM(points: number): number {
  return points / 100;
}

/**
 * Calculate points needed for discount
 */
export function rmToPoints(rm: number): number {
  return Math.ceil(rm * 100);
}
