import { NextRequest } from 'next/server';
import { addClient, removeClient } from '@/lib/sse/orderStreamManager';

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

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
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
    },
  });
}
