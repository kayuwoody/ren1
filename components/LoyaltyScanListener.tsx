'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useScanDetector } from '@/lib/hooks/useScanDetector';
import { useCart } from '@/context/cartContext';
import { Check, AlertCircle, Star, Gift } from 'lucide-react';

export default function LoyaltyScanListener() {
  const { setCustomer, setVoucher, setPass, cartItems } = useCart();
  const [toast, setToast] = useState<{
    type: 'success' | 'info' | 'error' | 'voucher';
    message: string;
    sub?: string;
  } | null>(null);
  const cooldown = useRef(false);

  const itemFinalTotal = cartItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);

  const handleScan = useCallback(async (value: string) => {
    if (cooldown.current) return;

    const cleaned = value.replace(/[^0-9+\-]/g, '');
    const isPhone = /^(\+?60|0)\d{8,11}$/.test(cleaned);

    if (isPhone) {
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
        } else {
          if (data.member) {
            setCustomer({
              member_id: data.member.id,
              phone: data.member.phone,
              name: data.member.name,
            });
          }

          if (data.already_scanned_today) {
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
        }
      } catch {
        setToast({ type: 'error', message: 'Scan failed — network error' });
      }
      return;
    }

    const code = value.trim().toUpperCase();
    if (!/^[A-Z0-9\-]{4,}$/.test(code)) return;

    cooldown.current = true;
    setTimeout(() => { cooldown.current = false; }, 2000);

    if (code.startsWith('PASS-')) {
      try {
        const productIds = cartItems.map(item => String(item.productId));
        const res = await fetch('/api/passes/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, product_ids: productIds }),
        });
        const data = await res.json();
        if (!data.valid) {
          setToast({ type: 'error', message: data.reason || 'Invalid pass' });
          return;
        }

        setPass({
          id: data.pass.id,
          code: data.pass.code,
          program_name: data.pass.program_name,
          uses_remaining: data.pass.uses_remaining,
          eligible_product_ids: data.eligible_product_ids,
        });

        if (data.member) {
          setCustomer({
            member_id: data.member.id,
            phone: data.member.phone,
            name: data.member.name,
          });
        }

        const applicable = data.applicable_products?.length || 0;
        setToast({
          type: 'voucher',
          message: `Pass applied: ${data.pass.program_name}`,
          sub: `${data.pass.uses_remaining} uses left${applicable > 0 ? ` · ${applicable} item${applicable > 1 ? 's' : ''} eligible` : ''}${data.member ? ` — ${data.member.name || data.member.phone}` : ''}`,
        });
      } catch {
        setToast({ type: 'error', message: 'Pass validation failed' });
      }
      return;
    }

    try {
      const res = await fetch('/api/vouchers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, order_total: itemFinalTotal }),
      });
      const data = await res.json();
      if (!data.valid) {
        setToast({ type: 'error', message: data.reason || 'Invalid voucher' });
        return;
      }

      setVoucher(data.voucher);

      if (data.member) {
        setCustomer({
          member_id: data.member.id,
          phone: data.member.phone,
          name: data.member.name,
        });
      }

      const discountLabel = data.voucher.type === 'fixed'
        ? `RM ${data.voucher.discount_value.toFixed(2)} off`
        : `${data.voucher.discount_value}% off`;

      setToast({
        type: 'voucher',
        message: `Voucher applied: ${code}`,
        sub: `${discountLabel}${data.member ? ` — ${data.member.name || data.member.phone}` : ''}`,
      });
    } catch {
      setToast({ type: 'error', message: 'Voucher validation failed' });
    }
  }, [itemFinalTotal, cartItems, setCustomer, setVoucher, setPass]);

  useScanDetector(handleScan);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const bgColor = toast.type === 'success' ? 'bg-green-600' :
    toast.type === 'voucher' ? 'bg-purple-600' :
    toast.type === 'info' ? 'bg-blue-600' : 'bg-red-600';

  const Icon = toast.type === 'success' ? Check :
    toast.type === 'voucher' ? Gift :
    toast.type === 'info' ? Star : AlertCircle;

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 px-5 py-4 rounded-lg shadow-lg max-w-sm text-white ${bgColor}`}>
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold text-sm">{toast.message}</p>
        {toast.sub && <p className="text-xs opacity-90 mt-0.5">{toast.sub}</p>}
      </div>
    </div>
  );
}
