/**
 * Loyalty Points Service (local stub)
 *
 * Placeholder for future loyalty system.
 * Currently returns zero-state for all customers.
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

export async function getCustomerPoints(userId: number | string): Promise<LoyaltyPoints> {
  return { balance: 0, history: [] };
}

export async function awardPoints(
  userId: number | string,
  amount: number,
  reason: string,
  orderId?: string
): Promise<LoyaltyPoints> {
  return { balance: 0, history: [] };
}

export async function redeemPoints(
  userId: number | string,
  amount: number,
  reason: string,
  orderId?: string
): Promise<LoyaltyPoints> {
  return { balance: 0, history: [] };
}

export const POINTS_CONFIG = {
  MANUAL_PICKUP: 10,
  ORDER_COMPLETED: 5,
  FIRST_ORDER: 20,
  BIRTHDAY: 50,
  REFERRAL: 25,
  REVIEW_PRODUCT: 15,
};

export function pointsToRM(points: number): number {
  return points / 100;
}

export function rmToPoints(rm: number): number {
  return Math.ceil(rm * 100);
}
