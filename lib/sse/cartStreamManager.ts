/**
 * Server-Sent Events (SSE) Manager for Cart Updates
 * Manages SSE connections and broadcasts cart updates to all connected clients
 */

// In-memory store for SSE clients
const clients = new Set<ReadableStreamDefaultController>();

export function addClient(controller: ReadableStreamDefaultController) {
  clients.add(controller);
  console.log('📺 Customer display connected. Total clients:', clients.size);
  console.log('📺 Active clients:', Array.from(clients).map((c, i) => `Client-${i}`));
}

export function removeClient(controller: ReadableStreamDefaultController) {
  clients.delete(controller);
  console.log('📺 Customer display disconnected. Total clients:', clients.size);
  console.log('📺 Active clients:', Array.from(clients).map((c, i) => `Client-${i}`));
}

export function broadcastCartUpdate(cart: any[], isPendingOrder: boolean = false, voucher: any = null, pass: any = null) {
  console.log(`📢 Broadcasting to ${clients.size} client(s):`, cart.length, 'items', isPendingOrder ? '(pending order)' : '');

  if (clients.size === 0) {
    console.log('⚠️ No clients connected to broadcast to!');
    return;
  }

  const encoder = new TextEncoder();
  const message = `data: ${JSON.stringify({
    type: 'cart-update',
    cart,
    isPendingOrder,
    voucher,
    pass,
  })}\n\n`;
  const encodedMessage = encoder.encode(message);

  // Send to all connected clients
  const disconnectedClients: ReadableStreamDefaultController[] = [];

  clients.forEach((controller, index) => {
    try {
      controller.enqueue(encodedMessage);
      console.log(`✅ Sent to client ${index}`);
    } catch (err) {
      // Client might have disconnected, mark for removal
      console.error(`❌ Failed to send to client ${index}, marking for removal:`, err);
      disconnectedClients.push(controller);
    }
  });

  // Clean up disconnected clients
  disconnectedClients.forEach(client => {
    clients.delete(client);
    console.log('🧹 Removed disconnected client');
  });

  console.log(`📢 Broadcast complete. Remaining clients: ${clients.size}`);
}

export function getClientCount() {
  return clients.size;
}
