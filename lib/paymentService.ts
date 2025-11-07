/**
 * Payment Service - WooCommerce Integration
 *
 * Uses WooCommerce's existing Fiuu plugin for payment processing.
 * The POS creates orders and displays payment URLs to customers.
 * WooCommerce handles all payment gateway integration.
 */

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface PaymentInfo {
  orderID: number;
  paymentURL: string;
  status: PaymentStatus;
  total: string;
  currency: string;
}

/**
 * Extract payment info from WooCommerce order
 */
export function getPaymentInfo(order: any): PaymentInfo {
  return {
    orderID: order.id,
    paymentURL: order.payment_url || '',
    status: order.status as PaymentStatus,
    total: order.total,
    currency: order.currency,
  };
}

/**
 * Check if order has been paid
 */
export function isOrderPaid(order: any): boolean {
  const paidStatuses = ['processing', 'completed', 'on-hold'];
  return paidStatuses.includes(order.status);
}

/**
 * Check if payment failed or was cancelled
 */
export function isPaymentFailed(order: any): boolean {
  const failedStatuses = ['failed', 'cancelled', 'refunded'];
  return failedStatuses.includes(order.status);
}

/**
 * Poll order status until payment is complete or failed
 *
 * @param orderID - WooCommerce order ID
 * @param onStatusChange - Callback fired when status changes
 * @param options - Polling configuration
 * @returns Cleanup function to stop polling
 */
export function pollPaymentStatus(
  orderID: number,
  onStatusChange: (status: PaymentStatus, order: any) => void,
  options: {
    interval?: number;      // Polling interval in ms (default: 3000)
    timeout?: number;       // Stop after this many ms (default: 600000 = 10 min)
    onError?: (error: any) => void;
  } = {}
): () => void {
  const {
    interval = 3000,        // Poll every 3 seconds
    timeout = 600000,       // Stop after 10 minutes
    onError = console.error,
  } = options;

  let lastStatus: PaymentStatus | null = null;
  let pollInterval: NodeJS.Timeout | null = null;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let stopped = false;

  const cleanup = () => {
    stopped = true;
    if (pollInterval) clearInterval(pollInterval);
    if (timeoutHandle) clearTimeout(timeoutHandle);
  };

  const checkStatus = async () => {
    if (stopped) return;

    try {
      // Fetch order via API route (works in browser)
      const response = await fetch(`/api/orders/${orderID}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch order: ${response.statusText}`);
      }
      const order = await response.json();
      const currentStatus = order.status as PaymentStatus;

      // Only fire callback if status changed
      if (currentStatus !== lastStatus) {
        lastStatus = currentStatus;
        onStatusChange(currentStatus, order);
      }

      // Stop polling if payment completed or failed
      if (isOrderPaid(order) || isPaymentFailed(order)) {
        cleanup();
      }
    } catch (error) {
      onError(error);
      // Continue polling even on errors (might be temporary network issue)
    }
  };

  // Start polling
  checkStatus(); // Check immediately
  pollInterval = setInterval(checkStatus, interval);

  // Set timeout to stop polling
  timeoutHandle = setTimeout(() => {
    cleanup();
    onError(new Error(`Payment polling timed out after ${timeout}ms`));
  }, timeout);

  // Return cleanup function
  return cleanup;
}

/**
 * Wait for payment completion (Promise-based wrapper around pollPaymentStatus)
 *
 * @param orderID - WooCommerce order ID
 * @param options - Polling configuration
 * @returns Promise that resolves when payment completes or rejects if failed/timeout
 */
export function waitForPayment(
  orderID: number,
  options: {
    interval?: number;
    timeout?: number;
  } = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const cleanup = pollPaymentStatus(
      orderID,
      (status, order) => {
        if (isOrderPaid(order)) {
          resolve(order);
        } else if (isPaymentFailed(order)) {
          reject(new Error(`Payment failed with status: ${status}`));
        }
      },
      {
        ...options,
        onError: reject,
      }
    );

    // Cleanup on promise settlement (not needed since pollPaymentStatus auto-cleans, but good practice)
    const originalThen = Promise.prototype.then;
  });
}

/**
 * Generate QR code data URL for payment link
 * NOTE: Disabled - using local bank QR codes instead
 *
 * @deprecated Use local bank QR codes for payments
 */
export async function generatePaymentQR(paymentURL: string): Promise<string> {
  // Not implemented - using local bank QR codes
  throw new Error('QR code generation disabled. Use local bank QR codes instead.');
}

/**
 * Get shortened payment URL for display
 * Useful for showing to customers without exposing full URL
 */
export function getShortenedPaymentURL(paymentURL: string): string {
  try {
    const url = new URL(paymentURL);
    return `${url.hostname}/...${url.pathname.slice(-8)}`;
  } catch {
    return paymentURL.slice(0, 30) + '...';
  }
}
