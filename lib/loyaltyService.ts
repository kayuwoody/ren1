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
    console.log(`🔍 [getCustomerPoints] Fetching points for user ${userId}`);
    const { data: customer } = await wcApi.get(`customers/${userId}`);
    console.log(`🔍 [getCustomerPoints] Customer meta_data count:`, customer.meta_data?.length || 0);

    // Extract points from meta_data (without underscore prefix - WooCommerce blocks private meta)
    const pointsMeta = customer.meta_data?.find((m: any) => m.key === 'loyalty_points');
    const historyMeta = customer.meta_data?.find((m: any) => m.key === 'loyalty_history');

    console.log(`🔍 [getCustomerPoints] Found loyalty meta:`, {
      pointsMeta: pointsMeta ? { key: pointsMeta.key, value: pointsMeta.value } : null,
      historyMeta: historyMeta ? { key: historyMeta.key, valueLength: historyMeta.value?.length } : null
    });

    const pointsBalance = pointsMeta?.value || 0;
    const pointsHistory = historyMeta?.value || '[]';

    const result = {
      balance: Number(pointsBalance),
      history: JSON.parse(pointsHistory)
    };

    console.log(`🔍 [getCustomerPoints] Returning:`, { balance: result.balance, historyCount: result.history.length });

    return result;
  } catch (err: any) {
    console.error('❌ Failed to get customer points:', err);
    console.error('❌ Error details:', err?.response?.data || err?.message);
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
    console.log(`🔍 [awardPoints] Starting for user ${userId}, amount ${amount}`);

    // 1. Fetch customer data ONCE (to get current points AND existing meta_data)
    console.log(`🔍 [awardPoints] Fetching customer ${userId} from WooCommerce...`);
    const { data: customer } = await wcApi.get(`customers/${userId}`);
    console.log(`🔍 [awardPoints] Customer fetched, current meta_data count:`, customer.meta_data?.length || 0);

    // Extract current points from the customer data we just fetched
    const pointsMeta = customer.meta_data?.find((m: any) => m.key === 'loyalty_points');
    const historyMeta = customer.meta_data?.find((m: any) => m.key === 'loyalty_history');

    const currentBalance = Number(pointsMeta?.value || 0);
    const currentHistory = JSON.parse(historyMeta?.value || '[]');

    console.log(`🔍 [awardPoints] Current points:`, { balance: currentBalance, historyCount: currentHistory.length });

    // 2. Calculate new balance
    const newBalance = currentBalance + amount;
    console.log(`🔍 [awardPoints] New balance will be: ${newBalance}`);

    // 3. Add transaction to history
    const transaction: PointsTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'earned',
      amount,
      reason,
      orderId: orderId ? String(orderId) : undefined,
      timestamp: new Date().toISOString()
    };

    const newHistory = [transaction, ...currentHistory].slice(0, 100); // Keep last 100 transactions
    console.log(`🔍 [awardPoints] History entries: ${newHistory.length}`);

    // 4. Update customer meta_data (reusing the customer data we already fetched)
    const existingMeta = customer.meta_data || [];

    // Remove old points/history entries (using non-underscore keys - WooCommerce blocks private meta)
    const filteredMeta = existingMeta.filter((m: any) =>
      m.key !== 'loyalty_points' && m.key !== 'loyalty_history'
    );
    console.log(`🔍 [awardPoints] Filtered meta (removed old loyalty data):`, filteredMeta.length);

    // Add new points/history (using non-underscore keys - WooCommerce blocks private meta)
    const updatedMeta = [
      ...filteredMeta,
      { key: 'loyalty_points', value: String(newBalance) },
      { key: 'loyalty_history', value: JSON.stringify(newHistory) }
    ];
    console.log(`🔍 [awardPoints] Updated meta (with new loyalty data):`, updatedMeta.length);
    console.log(`🔍 [awardPoints] New loyalty meta:`, {
      points: updatedMeta.find(m => m.key === 'loyalty_points'),
      historyLength: JSON.parse(updatedMeta.find(m => m.key === 'loyalty_history')?.value || '[]').length
    });

    console.log(`🔍 [awardPoints] Sending PUT request to WooCommerce...`);
    const updateResponse = await wcApi.put(`customers/${userId}`, {
      meta_data: updatedMeta
    });
    console.log(`🔍 [awardPoints] WooCommerce PUT response status:`, updateResponse.status);
    console.log(`🔍 [awardPoints] Updated customer meta_data count:`, updateResponse.data?.meta_data?.length || 0);

    // Verify the update in the response
    const savedPoints = updateResponse.data.meta_data?.find((m: any) => m.key === 'loyalty_points')?.value;
    console.log(`🔍 [awardPoints] Verified saved points in response:`, savedPoints);

    // CRITICAL: Re-fetch customer to verify WooCommerce actually saved it
    console.log(`🔍 [awardPoints] Re-fetching customer to verify save...`);
    const { data: verifyCustomer } = await wcApi.get(`customers/${userId}`);
    const actualPoints = verifyCustomer.meta_data?.find((m: any) => m.key === 'loyalty_points')?.value;
    console.log(`🔍 [awardPoints] ACTUAL points in database:`, actualPoints);

    if (actualPoints !== String(newBalance)) {
      console.error(`❌ [awardPoints] SAVE FAILED! Expected ${newBalance}, got ${actualPoints}`);
      console.error(`❌ [awardPoints] WooCommerce accepted PUT but didn't persist data`);
      throw new Error(`Points save failed - WooCommerce returned success but data not persisted`);
    }

    console.log(`✅ Awarded ${amount} points to customer #${userId}: ${reason} (new balance: ${newBalance})`);

    return {
      balance: newBalance,
      history: newHistory
    };
  } catch (err: any) {
    console.error('❌ Failed to award points:', err);
    console.error('❌ Error details:', err?.response?.data || err?.message);
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
      m.key !== 'loyalty_points' && m.key !== 'loyalty_history'
    );

    const updatedMeta = [
      ...filteredMeta,
      { key: 'loyalty_points', value: String(newBalance) },
      { key: 'loyalty_history', value: JSON.stringify(newHistory) }
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
