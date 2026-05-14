'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import {
  Clock, User, Car, MapPin, Volume2, VolumeX,
  Check, X, ChefHat, Package, AlertTriangle, Pause, Play,
  Store, Coffee, UtensilsCrossed, Layers,
} from 'lucide-react';

interface OrderItem {
  id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  mods: Record<string, string> | null;
}

interface OnlineOrder {
  id: string;
  status: string;
  pickup_type: string;
  outlet_id: string;
  customer_name: string;
  customer_phone: string;
  total_paid: number;
  currency: string;
  reject_reason: string | null;
  accepted_at: string | null;
  ready_at: string | null;
  created_at: string;
  updated_at: string;
  online_order_items: OrderItem[];
}

interface MenuProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  available: boolean;
  stock_count: number | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function formatMods(mods: Record<string, string> | null): string {
  if (!mods) return '';
  return Object.entries(mods)
    .filter(([k, v]) => v && k !== 'notes')
    .map(([, v]) => v)
    .join(' · ');
}

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);

    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1100;
      osc2.type = 'sine';
      gain2.gain.value = 0.3;
      osc2.start();
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      osc2.stop(ctx.currentTime + 1);
    }, 200);
  } catch {
    // Audio not available
  }
}

export default function OnlineOrdersPage() {
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [intakePaused, setIntakePaused] = useState(false);
  const [avgWait, setAvgWait] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [updatingOrders, setUpdatingOrders] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const [showMenu, setShowMenu] = useState(false);
  const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
  const [togglingProducts, setTogglingProducts] = useState<Set<string>>(new Set());
  const knownOrderIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/online-orders');
      if (res.ok) {
        const data = await res.json();
        const fetched: OnlineOrder[] = data.orders ?? [];

        if (initialLoadDone.current && soundEnabled) {
          const newPending = fetched.filter(
            o => o.status === 'pending' && !knownOrderIds.current.has(o.id)
          );
          if (newPending.length > 0) {
            playAlertSound();
          }
        }

        knownOrderIds.current = new Set(fetched.map(o => o.id));
        initialLoadDone.current = true;
        setOrders(fetched);
      }
    } catch (err) {
      console.error('Failed to fetch online orders:', err);
    } finally {
      setLoading(false);
    }
  }, [soundEnabled]);

  const fetchIntakeStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/online-orders/intake');
      if (res.ok) {
        const data = await res.json();
        setIntakePaused(data.intake_paused);
      }
    } catch {}
  }, []);

  const fetchAvgWait = useCallback(async () => {
    try {
      const res = await fetch('/api/online-orders/avg-wait');
      if (res.ok) {
        const data = await res.json();
        setAvgWait(data.avgWaitSeconds);
      }
    } catch {}
  }, []);

  const fetchMenuProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/online-orders/products');
      if (res.ok) {
        const data = await res.json();
        setMenuProducts(data.products ?? []);
      }
    } catch {}
  }, []);

  const toggleProductAvailability = async (productId: string, available: boolean) => {
    setTogglingProducts(prev => new Set(prev).add(productId));
    try {
      const res = await fetch('/api/online-orders/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, available }),
      });
      if (res.ok) {
        setMenuProducts(prev =>
          prev.map(p => p.id === productId ? { ...p, available, stock_count: available ? null : p.stock_count } : p)
        );
      }
    } catch {}
    setTogglingProducts(prev => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  };

  useEffect(() => {
    fetchOrders();
    fetchIntakeStatus();
    fetchAvgWait();
    fetchMenuProducts();

    const pollInterval = setInterval(fetchOrders, 15000);
    const tickInterval = setInterval(() => setNow(Date.now()), 30000);

    const channel = supabaseBrowser
      .channel('pos-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'online_orders', filter: 'outlet_id=eq.main' },
        () => fetchOrders()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'online_orders', filter: 'outlet_id=eq.main' },
        () => fetchOrders()
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
      supabaseBrowser.removeChannel(channel);
    };
  }, [fetchOrders, fetchIntakeStatus, fetchAvgWait]);

  useEffect(() => {
    if (showMenu) fetchMenuProducts();
  }, [showMenu, fetchMenuProducts]);

  const updateStatus = async (orderId: string, newStatus: string, reason?: string) => {
    setUpdatingOrders(prev => new Set(prev).add(orderId));
    try {
      const res = await fetch(`/api/online-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reject_reason: reason }),
      });

      if (res.ok) {
        await fetchOrders();
        if (newStatus === 'collected') fetchAvgWait();
        setRejectingOrderId(null);
        setRejectReason('');
      } else {
        const err = await res.json();
        alert(`Failed: ${err.error}`);
      }
    } catch (err) {
      alert('Network error updating order');
    } finally {
      setUpdatingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const toggleIntake = async () => {
    const newState = !intakePaused;
    try {
      const res = await fetch('/api/online-orders/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: newState }),
      });
      if (res.ok) {
        setIntakePaused(newState);
      }
    } catch {}
  };

  const pending = orders.filter(o => o.status === 'pending');
  const accepted = orders.filter(o => o.status === 'accepted');
  const ready = orders.filter(o => o.status === 'ready');

  const formatWait = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFF6E8' }}>
        <div className="text-lg" style={{ color: '#3A2414' }}>Loading online orders...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFF6E8' }}>
      {intakePaused && (
        <div className="px-4 py-3 text-center text-white font-semibold" style={{ backgroundColor: '#C62828' }}>
          <AlertTriangle className="inline w-5 h-5 mr-2 -mt-0.5" />
          Online ordering is PAUSED — customers cannot place new orders
        </div>
      )}

      <header className="px-4 py-3 flex items-center justify-between border-b" style={{ backgroundColor: '#FFFFFF', borderColor: '#E5DDD0' }}>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold" style={{ color: '#3A2414', fontFamily: "'Baloo 2', sans-serif" }}>
            Online Orders
          </h1>
          {pending.length > 0 && (
            <span
              className="px-2.5 py-0.5 rounded-full text-sm font-bold text-white animate-pulse"
              style={{ backgroundColor: '#F58220' }}
            >
              {pending.length} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {avgWait > 0 && (
            <div className="flex items-center gap-1.5 text-sm" style={{ color: '#546E7A' }}>
              <Clock className="w-4 h-4" />
              <span>Avg wait: {formatWait(avgWait)}</span>
            </div>
          )}

          <button
            onClick={() => setShowMenu(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition border"
            style={{ color: '#3A2414', borderColor: '#E5DDD0' }}
          >
            <Store className="w-4 h-4" /> Menu
            {menuProducts.some(p => !p.available) && (
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#C62828' }} />
            )}
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg hover:bg-gray-100"
            title={soundEnabled ? 'Mute alerts' : 'Enable alerts'}
          >
            {soundEnabled
              ? <Volume2 className="w-5 h-5" style={{ color: '#3A2414' }} />
              : <VolumeX className="w-5 h-5" style={{ color: '#546E7A' }} />
            }
          </button>

          <button
            onClick={toggleIntake}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition"
            style={{ backgroundColor: intakePaused ? '#2E7D32' : '#C62828' }}
          >
            {intakePaused
              ? <><Play className="w-4 h-4" /> Resume Intake</>
              : <><Pause className="w-4 h-4" /> Pause Intake</>
            }
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4 p-4 h-[calc(100vh-60px)]" style={{ minHeight: 0 }}>
        <Column
          title="New Orders"
          count={pending.length}
          color="#F58220"
          orders={pending}
          now={now}
          rejectingOrderId={rejectingOrderId}
          rejectReason={rejectReason}
          updatingOrders={updatingOrders}
          onSetRejectingOrderId={setRejectingOrderId}
          onSetRejectReason={setRejectReason}
          onUpdateStatus={updateStatus}
          renderActions={(order) => (
            <div className="flex gap-2 mt-3">
              <button
                disabled={updatingOrders.has(order.id)}
                onClick={() => updateStatus(order.id, 'accepted')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-white text-sm transition disabled:opacity-50"
                style={{ backgroundColor: '#2E7D32' }}
              >
                <Check className="w-4 h-4" /> Accept
              </button>
              {rejectingOrderId === order.id ? (
                <div className="flex-1 flex flex-col gap-1.5">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="w-full px-2 py-1.5 text-sm border rounded-lg"
                    style={{ borderColor: '#C62828' }}
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <button
                      disabled={updatingOrders.has(order.id)}
                      onClick={() => updateStatus(order.id, 'rejected', rejectReason || undefined)}
                      className="flex-1 py-1.5 rounded-lg font-semibold text-white text-xs disabled:opacity-50"
                      style={{ backgroundColor: '#C62828' }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => { setRejectingOrderId(null); setRejectReason(''); }}
                      className="flex-1 py-1.5 rounded-lg font-semibold text-xs bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setRejectingOrderId(order.id)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-white text-sm transition"
                  style={{ backgroundColor: '#C62828' }}
                >
                  <X className="w-4 h-4" /> Reject
                </button>
              )}
            </div>
          )}
        />

        <Column
          title="In Progress"
          count={accepted.length}
          color="#1565C0"
          orders={accepted}
          now={now}
          rejectingOrderId={rejectingOrderId}
          rejectReason={rejectReason}
          updatingOrders={updatingOrders}
          onSetRejectingOrderId={setRejectingOrderId}
          onSetRejectReason={setRejectReason}
          onUpdateStatus={updateStatus}
          renderActions={(order) => (
            <div className="flex gap-2 mt-3">
              <button
                disabled={updatingOrders.has(order.id)}
                onClick={() => updateStatus(order.id, 'ready')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-white text-sm transition disabled:opacity-50"
                style={{ backgroundColor: '#1565C0' }}
              >
                <ChefHat className="w-4 h-4" /> Mark Ready
              </button>
              {rejectingOrderId === order.id ? (
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="w-full px-2 py-1.5 text-sm border rounded-lg"
                    style={{ borderColor: '#C62828' }}
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <button
                      disabled={updatingOrders.has(order.id)}
                      onClick={() => updateStatus(order.id, 'rejected', rejectReason || undefined)}
                      className="flex-1 py-1.5 rounded-lg font-semibold text-white text-xs disabled:opacity-50"
                      style={{ backgroundColor: '#C62828' }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => { setRejectingOrderId(null); setRejectReason(''); }}
                      className="flex-1 py-1.5 rounded-lg font-semibold text-xs bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setRejectingOrderId(order.id)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition"
                  style={{ color: '#C62828', border: '1.5px solid #C62828' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        />

        <Column
          title="Ready"
          count={ready.length}
          color="#2E7D32"
          orders={ready}
          now={now}
          rejectingOrderId={rejectingOrderId}
          rejectReason={rejectReason}
          updatingOrders={updatingOrders}
          onSetRejectingOrderId={setRejectingOrderId}
          onSetRejectReason={setRejectReason}
          onUpdateStatus={updateStatus}
          renderActions={(order) => (
            <button
              disabled={updatingOrders.has(order.id)}
              onClick={() => updateStatus(order.id, 'collected')}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-white text-sm mt-3 transition disabled:opacity-50"
              style={{ backgroundColor: '#2E7D32' }}
            >
              <Package className="w-4 h-4" /> Collected
            </button>
          )}
        />
      </div>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-50 flex flex-col">
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#E5DDD0' }}>
              <h2 className="text-lg font-bold" style={{ color: '#3A2414', fontFamily: "'Baloo 2', sans-serif" }}>
                Menu Availability
              </h2>
              <button onClick={() => setShowMenu(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" style={{ color: '#546E7A' }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {(['coffee', 'non-coffee', 'food', 'combo'] as const).map(cat => {
                const items = menuProducts.filter(p => p.category === cat);
                if (items.length === 0) return null;
                const icon = cat === 'coffee' ? <Coffee className="w-4 h-4" />
                  : cat === 'food' ? <UtensilsCrossed className="w-4 h-4" />
                  : cat === 'combo' ? <Layers className="w-4 h-4" />
                  : <Coffee className="w-4 h-4" />;
                const label = cat === 'non-coffee' ? 'Non-Coffee' : cat.charAt(0).toUpperCase() + cat.slice(1);
                return (
                  <div key={cat}>
                    <div className="px-5 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                      style={{ color: '#546E7A', backgroundColor: '#FFF6E8' }}>
                      {icon} {label}
                    </div>
                    {items.map(product => (
                      <div
                        key={product.id}
                        className="px-5 py-3 flex items-center justify-between border-b"
                        style={{ borderColor: '#F0EBE4' }}
                      >
                        <div>
                          <div className="text-sm font-medium" style={{ color: '#3A2414' }}>{product.name}</div>
                          <div className="text-xs" style={{ color: '#546E7A' }}>RM {product.price.toFixed(2)}</div>
                        </div>
                        <button
                          disabled={togglingProducts.has(product.id)}
                          onClick={() => toggleProductAvailability(product.id, !product.available)}
                          className="relative w-12 h-7 rounded-full transition-colors disabled:opacity-50"
                          style={{ backgroundColor: product.available ? '#2E7D32' : '#ccc' }}
                        >
                          <span
                            className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform"
                            style={{ left: product.available ? '22px' : '2px' }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t text-xs text-center" style={{ color: '#546E7A', borderColor: '#E5DDD0' }}>
              Toggling off marks item as sold out in the customer menu
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Column({
  title,
  count,
  color,
  orders,
  now,
  rejectingOrderId,
  rejectReason,
  updatingOrders,
  onSetRejectingOrderId,
  onSetRejectReason,
  onUpdateStatus,
  renderActions,
}: {
  title: string;
  count: number;
  color: string;
  orders: OnlineOrder[];
  now: number;
  rejectingOrderId: string | null;
  rejectReason: string;
  updatingOrders: Set<string>;
  onSetRejectingOrderId: (id: string | null) => void;
  onSetRejectReason: (r: string) => void;
  onUpdateStatus: (id: string, status: string, reason?: string) => Promise<void>;
  renderActions: (order: OnlineOrder) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="text-base font-bold" style={{ color: '#3A2414', fontFamily: "'Baloo 2', sans-serif" }}>
          {title}
        </h2>
        <span
          className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {orders.length === 0 && (
          <div className="text-center py-8 text-sm" style={{ color: '#546E7A' }}>
            No orders
          </div>
        )}
        {orders.map(order => (
          <OrderCard key={order.id} order={order} now={now} renderActions={renderActions} />
        ))}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  now,
  renderActions,
}: {
  order: OnlineOrder;
  now: number;
  renderActions: (order: OnlineOrder) => React.ReactNode;
}) {
  const elapsed = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
  const isUrgent = order.status === 'pending' && elapsed > 5;

  return (
    <div
      className="rounded-2xl p-4 shadow-sm border transition"
      style={{
        backgroundColor: '#FFFFFF',
        borderColor: isUrgent ? '#C62828' : '#E5DDD0',
        borderWidth: isUrgent ? 2 : 1,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <span
            className="text-lg font-extrabold"
            style={{ color: '#3A2414', fontFamily: "'Baloo 2', sans-serif" }}
          >
            {order.id}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-xs" style={{ color: isUrgent ? '#C62828' : '#546E7A' }}>
              <Clock className="w-3.5 h-3.5" />
              {timeAgo(order.created_at)}
            </span>
          </div>
        </div>
        <span
          className="text-base font-bold"
          style={{ color: '#3A2414' }}
        >
          RM {Number(order.total_paid).toFixed(2)}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-2.5 text-sm" style={{ color: '#3A2414' }}>
        <User className="w-3.5 h-3.5" style={{ color: '#546E7A' }} />
        <span className="font-medium">{order.customer_name || 'Guest'}</span>
        <span className="ml-auto flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: order.pickup_type === 'curbside' ? '#E3F2FD' : '#FFF3E0',
            color: order.pickup_type === 'curbside' ? '#1565C0' : '#F58220',
          }}
        >
          {order.pickup_type === 'curbside'
            ? <><Car className="w-3.5 h-3.5" /> Curbside</>
            : <><MapPin className="w-3.5 h-3.5" /> Counter</>
          }
        </span>
      </div>

      <div className="space-y-1.5 border-t pt-2" style={{ borderColor: '#F0EBE4' }}>
        {order.online_order_items?.map(item => {
          const mods = formatMods(item.mods);
          const notes = item.mods?.notes;
          return (
            <div key={item.id}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold" style={{ color: '#3A2414' }}>
                  x{item.qty}
                </span>
                <span className="text-sm" style={{ color: '#3A2414' }}>
                  {item.product_name}
                </span>
              </div>
              {mods && (
                <div className="ml-6 text-xs" style={{ color: '#546E7A' }}>{mods}</div>
              )}
              {notes && (
                <div className="ml-6 text-xs italic" style={{ color: '#F58220' }}>Note: {notes}</div>
              )}
            </div>
          );
        })}
      </div>

      {renderActions(order)}
    </div>
  );
}
