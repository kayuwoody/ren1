'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star, Gift, Clock, Plus, Minus, ChevronRight } from 'lucide-react';

interface Member {
  id: string;
  phone: string;
  name: string | null;
  enrolled_at: string;
  updated_at: string;
}

interface Balance {
  id: string;
  program_id: string;
  points_balance: number;
  total_earned: number;
  loyalty_programs: {
    name: string;
    threshold: number;
    trigger_type: string;
  } | null;
}

interface Transaction {
  id: string;
  program_id: string | null;
  type: string;
  points: number;
  description: string | null;
  reference_id: string | null;
  created_at: string;
  loyalty_programs: { name: string } | null;
}

interface Voucher {
  id: string;
  code: string;
  type: 'fixed' | 'percent';
  discount_value: number;
  min_order_amount: number;
  max_uses: number;
  times_used: number;
  expires_at: string | null;
  is_active: boolean;
  source: string;
  created_at: string;
}

interface Program {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
}

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const memberId = params.memberId as string;

  const [member, setMember] = useState<Member | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);

  useEffect(() => {
    fetchMember();
    fetchPrograms();
  }, [memberId]);

  async function fetchMember() {
    setLoading(true);
    try {
      const res = await fetch(`/api/loyalty/members/${memberId}`);
      if (!res.ok) {
        router.push('/admin/loyalty');
        return;
      }
      const data = await res.json();
      setMember(data.member);
      setBalances(data.balances);
      setTransactions(data.transactions);
      setVouchers(data.vouchers);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPrograms() {
    const res = await fetch('/api/loyalty/config');
    if (res.ok) {
      const data = await res.json();
      setPrograms(data.programs);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!member) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/loyalty" className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">
                {member.name || member.phone}
              </h1>
              <p className="text-sm text-gray-500">
                {member.name ? member.phone : ''} · Joined {new Date(member.enrolled_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <button
              onClick={() => setShowAdjust(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Adjust Points
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Program Balances */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Program Balances
          </h2>
          {balances.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">No program enrollments yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {balances.map(b => {
                const threshold = b.loyalty_programs?.threshold || 1;
                const progress = Math.min((b.points_balance / threshold) * 100, 100);
                return (
                  <div key={b.id} className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-sm">{b.loyalty_programs?.name || 'Unknown'}</h3>
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded capitalize">
                        {b.loyalty_programs?.trigger_type}
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-yellow-600">{b.points_balance}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {threshold - b.points_balance} more to next voucher · {b.total_earned} lifetime
                    </div>
                    <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-yellow-500 h-full rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0</span>
                      <span>{threshold}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Vouchers */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Gift className="w-5 h-5 text-purple-500" />
            Vouchers ({vouchers.length})
          </h2>
          {vouchers.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">No vouchers issued yet.</p>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Code</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Discount</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Source</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vouchers.map(v => {
                    const expired = v.expires_at && new Date(v.expires_at) < new Date();
                    const used = v.times_used >= v.max_uses;
                    let statusColor = 'bg-green-100 text-green-600';
                    let statusText = 'Active';
                    if (!v.is_active) { statusColor = 'bg-gray-100 text-gray-500'; statusText = 'Disabled'; }
                    else if (expired) { statusColor = 'bg-red-100 text-red-600'; statusText = 'Expired'; }
                    else if (used) { statusColor = 'bg-orange-100 text-orange-600'; statusText = 'Used'; }

                    return (
                      <tr key={v.id} className={`${!v.is_active || expired ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-2 font-mono text-sm font-semibold">{v.code}</td>
                        <td className="px-4 py-2 text-sm">
                          {v.type === 'fixed' ? `RM ${v.discount_value.toFixed(2)}` : `${v.discount_value}%`}
                        </td>
                        <td className="px-4 py-2 text-sm capitalize text-gray-600">{v.source}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${statusColor}`}>{statusText}</span>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {v.expires_at
                            ? new Date(v.expires_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
                            : 'Never'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Transaction History */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            Transaction History
          </h2>
          {transactions.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">No transactions yet.</p>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Program</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Description</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map(t => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {new Date(t.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
                        {' '}
                        <span className="text-gray-400">
                          {new Date(t.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">{t.loyalty_programs?.name || '—'}</td>
                      <td className="px-4 py-2 text-sm">{t.description || t.type}</td>
                      <td className={`px-4 py-2 text-sm font-semibold text-right ${t.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {t.points > 0 ? '+' : ''}{t.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAdjust && (
        <AdjustPointsModal
          memberId={member.id}
          programs={programs}
          onClose={() => setShowAdjust(false)}
          onDone={() => { setShowAdjust(false); fetchMember(); }}
        />
      )}
    </div>
  );
}

function AdjustPointsModal({
  memberId,
  programs,
  onClose,
  onDone,
}: {
  memberId: string;
  programs: Program[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    program_id: programs[0]?.id || '',
    points: '',
    description: '',
    isDeduct: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.program_id || !form.points || !form.description) return;
    setSaving(true);

    const pts = parseInt(form.points) || 0;
    const finalPoints = form.isDeduct ? -Math.abs(pts) : Math.abs(pts);

    try {
      const res = await fetch(`/api/loyalty/members/${memberId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_id: form.program_id,
          points: finalPoints,
          description: form.description,
        }),
      });

      if (res.ok) {
        onDone();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to adjust points');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">Adjust Points</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
            <select
              value={form.program_id}
              onChange={e => setForm({ ...form, program_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, isDeduct: false })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                  !form.isDeduct ? 'bg-green-50 border-green-300 text-green-700' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Add Points
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, isDeduct: true })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                  form.isDeduct ? 'bg-red-50 border-red-300 text-red-700' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Minus className="w-4 h-4 inline mr-1" />
                Deduct Points
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
            <input
              type="number"
              min="1"
              value={form.points}
              onChange={e => setForm({ ...form, points: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="e.g. 5"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="e.g. Birthday bonus"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border rounded-lg hover:bg-gray-50" disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className={`flex-1 py-2 text-white rounded-lg disabled:opacity-50 ${
                form.isDeduct ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
              disabled={saving}
            >
              {saving ? 'Saving...' : form.isDeduct ? 'Deduct' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
