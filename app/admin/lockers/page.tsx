'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, Activity, Battery, Thermometer, RefreshCw } from 'lucide-react';

interface LockerStatus {
  lockerId: string;
  status: string;
  battery: number;
  occupiedSlots: string[];
  freeSlots: string[];
  temperature?: number;
  lastSeen: string;
}

export default function LockerMonitoringPage() {
  const [lockers, setLockers] = useState<LockerStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    fetchLockers();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchLockers, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLockers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/locker/heartbeat');
      if (res.ok) {
        const data = await res.json();
        setLockers(data.lockers || []);
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch lockers:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'offline':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getBatteryColor = (battery: number) => {
    if (battery >= 60) return 'text-green-600';
    if (battery >= 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-2">
            <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Locker Monitoring</h1>
              <p className="text-sm text-gray-500">Real-time status of all smart lockers</p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              {lastUpdate && (
                <>Last updated: {lastUpdate.toLocaleTimeString()}</>
              )}
            </div>
            <button
              onClick={fetchLockers}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {lockers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-600 mb-2">No Lockers Connected</h2>
            <p className="text-gray-500">
              Lockers will appear here once they send their first heartbeat signal
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {lockers.map((locker) => {
              const isOffline = locker.status === 'offline';
              const hoursSinceLastSeen = locker.lastSeen
                ? (Date.now() - new Date(locker.lastSeen).getTime()) / (1000 * 60 * 60)
                : null;

              return (
                <div key={locker.lockerId} className="bg-white rounded-lg shadow hover:shadow-lg transition">
                  {/* Locker Header */}
                  <div className="p-6 border-b">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-xl font-bold">{locker.lockerId}</h2>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getStatusColor(locker.status)}`}>
                        {isOffline ? '🔴 Offline' : '🟢 Online'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Last heartbeat: {hoursSinceLastSeen !== null
                        ? hoursSinceLastSeen < 1
                          ? `${Math.floor(hoursSinceLastSeen * 60)} min ago`
                          : `${hoursSinceLastSeen.toFixed(1)} hours ago`
                        : 'Never'}
                    </p>
                  </div>

                  {/* Locker Stats */}
                  <div className="p-6 space-y-4">
                    {/* Slot Usage */}
                    <div className="flex items-center gap-3">
                      <Lock className="w-5 h-5 text-blue-600" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-500">Slot Usage</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-blue-600 h-full"
                              style={{
                                width: `${((locker.occupiedSlots?.length || 0) / ((locker.occupiedSlots?.length || 0) + (locker.freeSlots?.length || 1))) * 100}%`
                              }}
                            />
                          </div>
                          <span className="text-sm font-semibold">
                            {locker.occupiedSlots?.length || 0}/{(locker.occupiedSlots?.length || 0) + (locker.freeSlots?.length || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Battery Level - Running on main power, so this would show power status */}
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-500">Power Status</p>
                        <p className="font-semibold">Main Power Connected</p>
                      </div>
                    </div>

                    {/* Temperature */}
                    {locker.temperature !== undefined && (
                      <div className="flex items-center gap-3">
                        <Thermometer className="w-5 h-5 text-orange-600" />
                        <div>
                          <p className="text-sm text-gray-500">Temperature</p>
                          <p className="font-semibold">{locker.temperature}°C</p>
                        </div>
                      </div>
                    )}

                    {/* Occupied Slots Detail */}
                    {locker.occupiedSlots && locker.occupiedSlots.length > 0 && (
                      <div className="pt-3 border-t">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Occupied Slots:</p>
                        <div className="flex flex-wrap gap-2">
                          {locker.occupiedSlots.map(slot => (
                            <span key={slot} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                              {slot}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Free Slots Detail */}
                    {locker.freeSlots && locker.freeSlots.length > 0 && (
                      <div className="pt-3 border-t">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Free Slots:</p>
                        <div className="flex flex-wrap gap-2">
                          {locker.freeSlots.map(slot => (
                            <span key={slot} className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-medium">
                              {slot}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Alert if offline */}
                  {isOffline && (
                    <div className="p-4 bg-red-50 border-t border-red-200">
                      <p className="text-sm text-red-800">
                        ⚠️ This locker hasn't sent a heartbeat in over 2 hours. Check connectivity.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
