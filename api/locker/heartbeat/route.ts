import { NextResponse } from 'next/server';
import { handleApiError, unauthorizedError } from '@/lib/api/error-handler';

/**
 * Locker Heartbeat Endpoint
 *
 * Remote lockers send periodic heartbeats to report status
 * Helps monitor:
 * - Locker online/offline status
 * - Battery levels
 * - Occupied vs available slots
 * - Connectivity issues
 *
 * Frequency: Every 1 hour (configurable)
 * Data usage: ~200 bytes per heartbeat = 5KB/day
 */

// In-memory store for locker status (use Redis in production)
const lockerStatus = new Map();

export async function POST(req: Request) {
  try {
    // 1. Authenticate
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || token !== process.env.LOCKER_SECRET_TOKEN) {
      return unauthorizedError('Unauthorized', '/api/locker/heartbeat');
    }

    // 2. Parse payload
    const body = await req.json();
    const {
      lockerId,
      status,
      battery,
      occupiedSlots = [],
      freeSlots = [],
      temperature,
      timestamp
    } = body;

    // 3. Store status
    lockerStatus.set(lockerId, {
      status,
      battery,
      occupiedSlots,
      freeSlots,
      temperature,
      lastSeen: timestamp || new Date().toISOString()
    });

    // 4. Log for monitoring
    console.log(`💓 Heartbeat from ${lockerId}:`, {
      battery,
      occupied: occupiedSlots.length,
      free: freeSlots.length,
      temp: temperature
    });

    // 5. Alert on issues
    if (battery < 20) {
      console.warn(`⚠️ ${lockerId} low battery: ${battery}%`);
    }
    if (temperature && (temperature < 0 || temperature > 50)) {
      console.warn(`⚠️ ${lockerId} abnormal temperature: ${temperature}°C`);
    }

    // 6. Return acknowledgment
    return NextResponse.json({
      status: 'acknowledged',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, '/api/locker/heartbeat');
  }
}

/**
 * GET endpoint - Check locker status
 * For staff dashboard to monitor all lockers
 */
export async function GET(req: Request) {
  try {
    // Get all locker statuses
    const lockers = Array.from(lockerStatus.entries()).map(([id, status]) => ({
      lockerId: id,
      ...status
    }));

    // Identify offline lockers (no heartbeat in last 2 hours)
    const now = Date.now();
    lockers.forEach(locker => {
      const lastSeen = new Date(locker.lastSeen).getTime();
      const hoursSinceHeartbeat = (now - lastSeen) / (1000 * 60 * 60);

      if (hoursSinceHeartbeat > 2) {
        locker.status = 'offline';
      }
    });

    return NextResponse.json({
      lockers,
      total: lockers.length,
      online: lockers.filter(l => l.status === 'online').length,
      offline: lockers.filter(l => l.status === 'offline').length
    });

  } catch (error) {
    return handleApiError(error, '/api/locker/heartbeat');
  }
}
