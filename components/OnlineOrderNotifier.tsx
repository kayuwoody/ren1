'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Bell } from 'lucide-react';

interface NotifierOrder {
  id: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  total_paid: number;
  arrived_at: string | null;
  created_at: string;
  online_order_items?: { id: string }[];
}

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    ctx.resume().then(() => {
      const playBeep = (freq: number, delay: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.value = 0.4;
        osc.start(ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
        osc.stop(ctx.currentTime + delay + 0.3);
      };
      playBeep(880, 0);
      playBeep(1100, 0.15);
      playBeep(880, 0.3);
      playBeep(1100, 0.45);
    });
  } catch {}
}

function playUrgentAlertSound() {
  try {
    const ctx = new AudioContext();
    ctx.resume().then(() => {
      const playBeep = (freq: number, delay: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'square';
        gain.gain.value = 0.5;
        osc.start(ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.5, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
        osc.stop(ctx.currentTime + delay + 0.2);
      };
      for (let i = 0; i < 6; i++) {
        playBeep(i % 2 === 0 ? 1200 : 900, i * 0.15);
      }
    });
  } catch {}
}

function sendDesktopNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, requireInteraction: true });
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export default function OnlineOrderNotifier() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [urgentOrders, setUrgentOrders] = useState<NotifierOrder[]>([]);

  const knownOrderIds = useRef<Set<string>>(new Set());
  const knownArrivedIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);
  const acknowledgedIds = useRef<Set<string>>(new Set());
  const escalationTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const urgentAlertInterval = useRef<NodeJS.Timeout | null>(null);
  const isAdminRef = useRef(false);

  useEffect(() => {
    const check = () => {
      const val = sessionStorage.getItem('admin_auth') === 'authenticated';
      isAdminRef.current = val;
      setIsAdmin(val);
    };
    check();
    window.addEventListener('storage', check);
    const interval = setInterval(check, 5000);
    return () => {
      window.removeEventListener('storage', check);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (isAdmin && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isAdmin]);

  const fetchOrders = useCallback(async () => {
    if (!isAdminRef.current) return;
    try {
      const res = await fetch('/api/online-orders');
      if (!res.ok) return;
      const data = await res.json();
      const fetched: NotifierOrder[] = data.orders ?? [];

      if (initialLoadDone.current) {
        const newPending = fetched.filter(
          o => o.status === 'pending' && !knownOrderIds.current.has(o.id)
        );
        const newArrivals = fetched.filter(
          o => o.arrived_at && !knownArrivedIds.current.has(o.id)
        );
        if (newPending.length > 0 || newArrivals.length > 0) {
          playAlertSound();
        }
        for (const order of newPending) {
          sendDesktopNotification(
            'New Online Order!',
            `${order.customer_name || 'Guest'} — RM ${Number(order.total_paid).toFixed(2)}`
          );
        }
        for (const order of newArrivals) {
          sendDesktopNotification(
            'Customer Arrived!',
            `${order.customer_name || 'Guest'} is here for pickup`
          );
        }
      } else {
        const existingPending = fetched.filter(o => o.status === 'pending');
        if (existingPending.length > 0) {
          playAlertSound();
        }
      }

      // Ensure every pending order has an escalation timer
      const allPending = fetched.filter(o => o.status === 'pending');
      for (const order of allPending) {
        if (!escalationTimers.current.has(order.id) && !acknowledgedIds.current.has(order.id)) {
          const timer = setTimeout(() => {
            if (!acknowledgedIds.current.has(order.id)) {
              setUrgentOrders(prev => {
                if (prev.some(o => o.id === order.id)) return prev;
                return [...prev, order];
              });
            }
          }, 120000);
          escalationTimers.current.set(order.id, timer);
        }
      }

      // Clear escalation for orders no longer pending
      for (const [id, timer] of escalationTimers.current) {
        const order = fetched.find(o => o.id === id);
        if (!order || order.status !== 'pending') {
          clearTimeout(timer);
          escalationTimers.current.delete(id);
          acknowledgedIds.current.add(id);
          setUrgentOrders(prev => prev.filter(o => o.id !== id));
        }
      }

      knownOrderIds.current = new Set(fetched.map(o => o.id));
      knownArrivedIds.current = new Set(fetched.filter(o => o.arrived_at).map(o => o.id));
      initialLoadDone.current = true;
    } catch {}
  }, []);

  // Urgent escalation: repeating sound + desktop notification
  useEffect(() => {
    if (urgentOrders.length > 0) {
      sendDesktopNotification(
        'URGENT: Unacknowledged Orders!',
        `${urgentOrders.length} order(s) waiting over 2 minutes — open POS now`
      );
      playUrgentAlertSound();
      urgentAlertInterval.current = setInterval(() => {
        sendDesktopNotification(
          'URGENT: Unacknowledged Orders!',
          `${urgentOrders.length} order(s) still waiting — open POS now`
        );
        playUrgentAlertSound();
      }, 15000);
    } else {
      if (urgentAlertInterval.current) {
        clearInterval(urgentAlertInterval.current);
        urgentAlertInterval.current = null;
      }
    }
    return () => {
      if (urgentAlertInterval.current) {
        clearInterval(urgentAlertInterval.current);
        urgentAlertInterval.current = null;
      }
    };
  }, [urgentOrders.length]);

  const acknowledgeUrgent = useCallback(() => {
    for (const order of urgentOrders) {
      acknowledgedIds.current.add(order.id);
    }
    setUrgentOrders([]);
    if (urgentAlertInterval.current) {
      clearInterval(urgentAlertInterval.current);
      urgentAlertInterval.current = null;
    }
  }, [urgentOrders]);

  // Poll + Supabase Realtime
  useEffect(() => {
    if (!isAdmin) return;

    fetchOrders();
    const pollInterval = setInterval(fetchOrders, 15000);

    // Live online-order feed via server-side SSE (no anon key in browser)
    const ordersSource = new EventSource('/api/online-orders/stream');
    ordersSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'online-orders-updated') fetchOrders();
      } catch {}
    };

    return () => {
      clearInterval(pollInterval);
      ordersSource.close();
      for (const timer of escalationTimers.current.values()) {
        clearTimeout(timer);
      }
      escalationTimers.current.clear();
      if (urgentAlertInterval.current) {
        clearInterval(urgentAlertInterval.current);
      }
    };
  }, [isAdmin, fetchOrders]);

  if (!isAdmin || urgentOrders.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(198, 40, 40, 0.85)' }}>
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full mx-4 text-center animate-pulse">
        <div className="flex justify-center mb-4">
          <Bell className="w-16 h-16" style={{ color: '#C62828' }} />
        </div>
        <h2 className="text-2xl font-extrabold mb-2" style={{ color: '#C62828' }}>
          Unacknowledged Orders!
        </h2>
        <p className="text-sm mb-6" style={{ color: '#546E7A' }}>
          {urgentOrders.length === 1
            ? 'An order has been waiting for over 2 minutes'
            : `${urgentOrders.length} orders have been waiting for over 2 minutes`}
        </p>
        <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
          {urgentOrders.map(order => (
            <div
              key={order.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ backgroundColor: '#FFF6E8', border: '1px solid #E5DDD0' }}
            >
              <div className="text-left">
                <div className="text-sm font-bold" style={{ color: '#3A2414' }}>
                  {order.customer_name || 'Guest'}
                </div>
                <div className="text-xs" style={{ color: '#546E7A' }}>
                  {order.online_order_items?.length || 0} items · {timeAgo(order.created_at)}
                </div>
              </div>
              <div className="text-base font-bold" style={{ color: '#3A2414' }}>
                RM {Number(order.total_paid).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={acknowledgeUrgent}
          className="w-full py-4 rounded-2xl font-bold text-lg text-white transition"
          style={{ backgroundColor: '#F58220' }}
        >
          Got it — I&apos;ll handle these now
        </button>
      </div>
    </div>
  );
}
