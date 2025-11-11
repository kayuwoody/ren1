import { NextRequest } from 'next/server';
import { addClient, removeClient } from '@/lib/sse/cartStreamManager';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Add this client to the manager
      addClient(controller);

      // Send initial connection message
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

      // Send keepalive pings every 15 seconds to prevent connection timeout
      const keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':keepalive\n\n'));
          console.log('📡 Sent keepalive ping to client');
        } catch (err) {
          console.error('Failed to send keepalive, clearing interval:', err);
          clearInterval(keepaliveInterval);
        }
      }, 15000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        console.log('📺 Client disconnected (abort signal)');
        clearInterval(keepaliveInterval);
        removeClient(controller);
        try {
          controller.close();
        } catch (err) {
          // Controller might already be closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
