/**
 * Server-Sent Events (SSE) Manager for Cart Updates
 * Manages SSE connections and broadcasts cart updates to all connected clients
 */

// In-memory store for SSE clients
const clients = new Set<ReadableStreamDefaultController>();

export function addClient(controller: ReadableStreamDefaultController) {
  clients.add(controller);
  console.log('📺 Customer display connected. Total clients:', clients.size);
}

export function removeClient(controller: ReadableStreamDefaultController) {
  clients.delete(controller);
  console.log('📺 Customer display disconnected. Total clients:', clients.size);
}

export function broadcastCartUpdate(cart: any[], isPendingOrder: boolean = false) {
  if (clients.size === 0) {
    console.log('📢 No clients connected, skipping broadcast');
    return;
  }

  const encoder = new TextEncoder();
  const message = `data: ${JSON.stringify({
    type: 'cart-update',
    cart,
    isPendingOrder
  })}\n\n`;
  const encodedMessage = encoder.encode(message);

  console.log(`📢 Broadcasting cart update to ${clients.size} client(s):`, cart.length, 'items');

  // Send to all connected clients
  const disconnectedClients: ReadableStreamDefaultController[] = [];

  clients.forEach((controller) => {
    try {
      controller.enqueue(encodedMessage);
    } catch (err) {
      // Client might have disconnected, mark for removal
      console.error('Failed to send to client, marking for removal');
      disconnectedClients.push(controller);
    }
  });

  // Clean up disconnected clients
  disconnectedClients.forEach(client => clients.delete(client));
}

export function getClientCount() {
  return clients.size;
}
