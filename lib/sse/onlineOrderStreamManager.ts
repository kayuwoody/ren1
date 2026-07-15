/**
 * Server-Sent Events (SSE) Manager for Online Order Updates
 *
 * The POS needs a live feed of incoming/changed online orders. Previously each
 * POS screen subscribed to Supabase Realtime directly from the browser, which
 * required shipping the public anon key in the bundle. This module moves that
 * subscription to the server: a single service-role Realtime subscription runs
 * in the (long-lived) POS server process and fans changes out to the connected
 * POS screens over SSE.
 *
 * Benefits:
 *  - No anon key in the browser — the browser only talks to our own SSE route.
 *  - `online_orders` can be locked with RLS: the server subscribes with the
 *    service-role key, which bypasses RLS, so it still receives every change.
 *  - Instant push (no polling lag), one Supabase subscription regardless of how
 *    many POS screens are open.
 */

import { supabase } from '@/lib/supabase';

// Local USB print server (runs on the same PC as the POS server).
const PRINT_SERVER_URL = process.env.LABEL_PRINT_SERVER_URL || 'http://127.0.0.1:9101';

// Guard against Realtime redelivering the same INSERT (would double-print).
const alertedOrderIds = new Set<string>();

/**
 * Fire the label printer's "new online order" alert sticker — a noisy/visual
 * cue so staff notice an order without watching the screen. Fully fire-and-
 * forget: never throws, never blocks the SSE broadcast, degrades silently if
 * the print server or label printer is offline.
 */
async function firePrintAlert(orderId: string) {
  if (!orderId || alertedOrderIds.has(orderId)) return;
  alertedOrderIds.add(orderId);
  // Bound memory — this set only needs recent ids to dedup redeliveries.
  if (alertedOrderIds.size > 500) {
    alertedOrderIds.clear();
    alertedOrderIds.add(orderId);
  }

  try {
    // Items are inserted just after the order row; give them a moment so the
    // sticker's item count is accurate.
    await new Promise((r) => setTimeout(r, 1200));

    const { data: order } = await supabase
      .from('online_orders')
      .select('id, customer_name, online_order_items ( qty )')
      .eq('id', orderId)
      .single();

    if (!order) return;

    await fetch(`${PRINT_SERVER_URL}/print-label-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: order.id,
        customer_name: order.customer_name,
        line_items: (order.online_order_items ?? []).map((i: any) => ({ quantity: i.qty })),
      }),
    });
    console.log(`🔔 Fired new-order alert sticker for ${orderId}`);
  } catch (err) {
    console.warn('Alert sticker print failed (non-fatal):', err);
  }
}

// Connected SSE clients (one per open POS screen)
const clients = new Set<ReadableStreamDefaultController>();

// Single server-side Supabase Realtime channel, shared across all clients
let channel: ReturnType<typeof supabase.channel> | null = null;
let starting = false;

const encoder = new TextEncoder();

function broadcast(type: string) {
  if (clients.size === 0) return;
  const message = encoder.encode(`data: ${JSON.stringify({ type })}\n\n`);
  const dead: ReadableStreamDefaultController[] = [];
  clients.forEach((controller) => {
    try {
      controller.enqueue(message);
    } catch {
      dead.push(controller);
    }
  });
  dead.forEach((controller) => clients.delete(controller));
}

/**
 * Start the server-side Supabase Realtime subscription on online_orders.
 * Idempotent — runs once per server process. Re-arms itself on error so the
 * feed survives transient websocket drops.
 */
export function ensureOnlineOrderRealtime() {
  if (channel || starting) return;
  starting = true;

  channel = supabase
    .channel('server-online-orders')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'online_orders', filter: 'outlet_id=eq.main' },
      (payload) => {
        broadcast('online-orders-updated');
        // A brand-new order arrived — fire the sticker printer as an alert cue.
        const row = payload.new as { id?: string; status?: string } | undefined;
        if (row?.id && (!row.status || row.status === 'pending')) {
          void firePrintAlert(row.id);
        }
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'online_orders', filter: 'outlet_id=eq.main' },
      () => broadcast('online-orders-updated'),
    )
    .subscribe((status) => {
      console.log('📡 Online-orders realtime bridge status:', status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Tear down and allow a fresh subscription on the next tick
        try {
          channel?.unsubscribe();
        } catch {}
        channel = null;
        starting = false;
        setTimeout(() => ensureOnlineOrderRealtime(), 3000);
      }
    });
}

export function addClient(controller: ReadableStreamDefaultController) {
  clients.add(controller);
  ensureOnlineOrderRealtime();
  console.log('🛒 Online-orders SSE client connected. Total:', clients.size);
}

export function removeClient(controller: ReadableStreamDefaultController) {
  clients.delete(controller);
  console.log('🛒 Online-orders SSE client disconnected. Total:', clients.size);
}

export function getClientCount() {
  return clients.size;
}
