import { useState, useEffect } from 'react';

export interface WooOrder { status: string; meta_data: { key: string; value: any }[]; }

/**
 * Poll WooCommerce order metadata.
 */
export function useOrderMeta(orderId: string, interval = 30000) {
  const [status, setStatus] = useState<string>('pending');
  const [qrPayload, setQrPayload] = useState<string>('');
  const [lockerNumber, setLockerNumber] = useState<string>('');

  useEffect(() => {
    let iv: NodeJS.Timeout;
    const fetchMeta = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        const data: WooOrder = await res.json();
        setStatus(data.status);
        const locker = data.meta_data.find(m => m.key === 'locker_number')?.value;
        const qr     = data.meta_data.find(m => m.key === 'qr_payload')?.value;
        if (locker != null) setLockerNumber(locker);
        if (qr != null) setQrPayload(qr);
      } catch {}
    };
    fetchMeta();
    iv = setInterval(fetchMeta, interval);
    return () => clearInterval(iv);
  }, [orderId, interval]);

  return { status, qrPayload, lockerNumber };
}
