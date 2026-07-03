import { NextRequest } from 'next/server';
import { addClient, removeClient } from '@/lib/sse/onlineOrderStreamManager';

export const dynamic = 'force-dynamic';

/**
 * SSE stream of online-order changes for the POS screens.
 * The server holds the (service-role) Supabase Realtime subscription; browsers
 * connect here and never touch the anon key or Supabase directly.
 */
export async function GET(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      addClient(controller);

      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

      request.signal.addEventListener('abort', () => {
        removeClient(controller);
        try {
          controller.close();
        } catch {
          // already closed
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
