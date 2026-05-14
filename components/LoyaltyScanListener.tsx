'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useScanDetector } from '@/lib/hooks/useScanDetector';
import { Check, AlertCircle, Star } from 'lucide-react';

export default function LoyaltyScanListener() {
  const [toast, setToast] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
    sub?: string;
  } | null>(null);
  const cooldown = useRef(false);

  const handleScan = useCallback(async (value: string) => {
    if (cooldown.current) return;

    const cleaned = value.replace(/[^0-9+\-]/g, '');
    const isPhone = /^(\+?60|0)\d{8,11}$/.test(cleaned);
    if (!isPhone) return;

    cooldown.current = true;
    setTimeout(() => { cooldown.current = false; }, 2000);

    try {
      const res = await fetch('/api/loyalty/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: 'error', message: data.error || 'Scan failed' });
      } else if (data.already_scanned_today) {
        const name = data.member?.name || cleaned;
        setToast({ type: 'info', message: `${name} already scanned today` });
      } else {
        const name = data.member?.name || cleaned;
        const earned = data.results?.filter((r: any) => !r.skipped) || [];
        const vouchers = earned.flatMap((r: any) => r.vouchers_issued || []);
        let sub = earned.map((r: any) => `${r.program_name}: +${r.points_added}`).join(', ');
        if (vouchers.length > 0) sub += ` | ${vouchers.length} voucher${vouchers.length > 1 ? 's' : ''} issued!`;
        setToast({ type: 'success', message: `${name} — stamp recorded`, sub });
      }
    } catch {
      setToast({ type: 'error', message: 'Scan failed — network error' });
    }
  }, []);

  useScanDetector(handleScan);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 px-5 py-4 rounded-lg shadow-lg max-w-sm ${
      toast.type === 'success' ? 'bg-green-600 text-white' :
      toast.type === 'info' ? 'bg-blue-600 text-white' :
      'bg-red-600 text-white'
    }`}>
      {toast.type === 'success' ? <Check className="w-5 h-5 mt-0.5 shrink-0" /> :
       toast.type === 'info' ? <Star className="w-5 h-5 mt-0.5 shrink-0" /> :
       <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />}
      <div>
        <p className="font-semibold text-sm">{toast.message}</p>
        {toast.sub && <p className="text-xs opacity-90 mt-0.5">{toast.sub}</p>}
      </div>
    </div>
  );
}
