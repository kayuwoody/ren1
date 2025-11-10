/**
 * Server-Sent Events (SSE) Manager for Kitchen Order Updates
 * Manages SSE connections and broadcasts order updates to all connected kitchen displays
 */

// In-memory store for SSE clients
const clients = new Set<ReadableStreamDefaultController>();

export function addClient(controller: ReadableStreamDefaultController) {
  clients.add(controller);
  console.log('🍳 Kitchen display connected. Total clients:', clients.size);
}

export function removeClient(controller: ReadableStreamDefaultController) {
  clients.delete(controller);
  console.log('🍳 Kitchen display disconnected. Total clients:', clients.size);
}

export function broadcastOrderUpdate() {
  if (clients.size === 0) {
    console.log('📢 No kitchen displays connected, skipping broadcast');
    return;
  }

  const encoder = new TextEncoder();
  const message = `data: ${JSON.stringify({
    type: 'orders-updated'
  })}\n\n`;
  const encodedMessage = encoder.encode(message);

  console.log(`📢 Broadcasting order update to ${clients.size} kitchen display(s)`);

  // Send to all connected clients
  const disconnectedClients: ReadableStreamDefaultController[] = [];

  clients.forEach((controller) => {
    try {
      controller.enqueue(encodedMessage);
    } catch (err) {
      // Client might have disconnected, mark for removal
      console.error('Failed to send to kitchen display, marking for removal');
      disconnectedClients.push(controller);
    }
  });

  // Clean up disconnected clients
  disconnectedClients.forEach(client => clients.delete(client));
}

export function getClientCount() {
  return clients.size;
}
