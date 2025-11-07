import { useState, useEffect, useCallback, useRef } from 'react';
import { pollPaymentStatus, PaymentStatus } from '../paymentService';

interface UsePaymentStatusOptions {
  orderID: number;
  enabled?: boolean;        // Start polling immediately (default: true)
  interval?: number;        // Polling interval in ms (default: 3000)
  timeout?: number;         // Stop after this many ms (default: 600000 = 10 min)
  onSuccess?: (order: any) => void;  // Called when payment succeeds
  onFailure?: (order: any) => void;  // Called when payment fails
}

interface UsePaymentStatusReturn {
  status: PaymentStatus | null;
  order: any | null;
  isPolling: boolean;
  error: Error | null;
  startPolling: () => void;
  stopPolling: () => void;
}

/**
 * React hook for polling payment status
 *
 * @example
 * ```tsx
 * const { status, isPolling, startPolling } = usePaymentStatus({
 *   orderID: 12345,
 *   enabled: false, // Don't auto-start
 *   onSuccess: (order) => {
 *     console.log('Payment completed!', order);
 *     router.push('/order-complete');
 *   },
 * });
 *
 * // Start polling when customer scans QR
 * <Button onClick={startPolling}>Customer Scanned QR</Button>
 * ```
 */
export function usePaymentStatus({
  orderID,
  enabled = true,
  interval = 3000,
  timeout = 600000,
  onSuccess,
  onFailure,
}: UsePaymentStatusOptions): UsePaymentStatusReturn {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [order, setOrder] = useState<any | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);

  // Keep refs updated
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
  }, [onSuccess, onFailure]);

  const stopPolling = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    // Stop existing poll if any
    stopPolling();

    setIsPolling(true);
    setError(null);

    cleanupRef.current = pollPaymentStatus(
      orderID,
      (newStatus, newOrder) => {
        setStatus(newStatus);
        setOrder(newOrder);

        // Check if payment succeeded
        const paidStatuses = ['processing', 'completed', 'on-hold'];
        if (paidStatuses.includes(newStatus)) {
          onSuccessRef.current?.(newOrder);
        }

        // Check if payment failed
        const failedStatuses = ['failed', 'cancelled', 'refunded'];
        if (failedStatuses.includes(newStatus)) {
          onFailureRef.current?.(newOrder);
        }
      },
      {
        interval,
        timeout,
        onError: (err) => {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsPolling(false);
        },
      }
    );
  }, [orderID, interval, timeout, stopPolling]);

  // Auto-start if enabled
  useEffect(() => {
    if (enabled) {
      startPolling();
    }

    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  }, [enabled, startPolling, stopPolling]);

  return {
    status,
    order,
    isPolling,
    error,
    startPolling,
    stopPolling,
  };
}
