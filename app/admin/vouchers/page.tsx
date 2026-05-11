'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Gift, Plus, Trash2, Copy, Check } from 'lucide-react';

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
  member_id: string | null;
  loyalty_members?: { phone: string; name: string | null } | null;
  created_at: string;
}

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchVouchers();
  }, []);

  async function fetchVouchers() {
    setLoading(true);
    try {
      const res = await fetch('/api/vouchers');
      if (res.ok) {
        const data = await res.json();
        setVouchers(data.vouchers);
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(voucher: Voucher) {
    await fetch(`/api/vouchers/${voucher.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !voucher.is_active }),
    });
    fetchVouchers();
  }

  async function deleteVoucher(id: string, code: string) {
    if (!confirm(`Delete voucher "${code}"?`)) return;
    await fetch(`/api/vouchers/${id}`, { method: 'DELETE' });
    fetchVouchers();
  }

  function copyCode(id: string, code: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function isExpired(v: Voucher) {
    return v.expires_at && new Date(v.expires_at) < new Date();
  }

  function statusBadge(v: Voucher) {
    if (!v.is_active) return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">Disabled</span>;
    if (isExpired(v)) return <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600">Expired</span>;
    if (v.times_used >= v.max_uses) return <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-600">Used</span>;
    return <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-600">Active</span>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/loyalty" className="p-2 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Gift className="w-6 h-6 text-purple-500" />
                  Vouchers
                </h1>
                <p className="text-sm text-gray-500">{vouchers.length} total</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Plus className="w-4 h-4" />
              Create Voucher
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-center py-12 text-gray-500">Loading...</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Code</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Discount</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Usage</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Source</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Member</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Expires</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vouchers.map(v => (
                  <tr key={v.id} className={`hover:bg-gray-50 ${!v.is_active || isExpired(v) ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{v.code}</span>
                        <button onClick={() => copyCode(v.id, v.code)} className="p-1 hover:bg-gray-100 rounded" title="Copy">
                          {copiedId === v.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {v.type === 'fixed' ? `RM ${v.discount_value.toFixed(2)}` : `${v.discount_value}%`}
                      {v.min_order_amount > 0 && (
                        <span className="text-gray-400 text-xs block">min RM {v.min_order_amount.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(v)}</td>
                    <td className="px-4 py-3 text-sm">{v.times_used}/{v.max_uses}</td>
                    <td className="px-4 py-3 text-sm capitalize text-gray-600">{v.source}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {v.loyalty_members ? (v.loyalty_members.name || v.loyalty_members.phone) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {v.expires_at
                        ? new Date(v.expires_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => toggleActive(v)}
                          className={`px-2 py-1 text-xs rounded ${v.is_active ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                        >
                          {v.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => deleteVoucher(v.id, v.code)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {vouchers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <Gift className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      No vouchers yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateVoucherModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchVouchers(); }}
        />
      )}
    </div>
  );
}

function CreateVoucherModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'fixed' as 'fixed' | 'percent',
    discount_value: '',
    min_order_amount: '',
    max_uses: '1',
    expires_days: '30',
  });

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'CO-';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    setForm({ ...form, code });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (parseInt(form.expires_days) || 30));

    try {
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          type: form.type,
          discount_value: parseFloat(form.discount_value) || 0,
          min_order_amount: parseFloat(form.min_order_amount) || 0,
          max_uses: parseInt(form.max_uses) || 1,
          expires_at: expiresAt.toISOString(),
        }),
      });

      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create voucher');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">Create Voucher</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="flex-1 px-3 py-2 border rounded-lg font-mono"
                placeholder="e.g. WELCOME10"
                required
              />
              <button type="button" onClick={generateCode} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
                Generate
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as 'fixed' | 'percent' })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="fixed">Fixed (RM)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value {form.type === 'fixed' ? '(RM)' : '(%)'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.discount_value}
                onChange={e => setForm({ ...form, discount_value: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Order (RM)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.min_order_amount}
                onChange={e => setForm({ ...form, min_order_amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses</label>
              <input
                type="number"
                min="1"
                value={form.max_uses}
                onChange={e => setForm({ ...form, max_uses: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expires In (days)</label>
            <input
              type="number"
              min="1"
              value={form.expires_days}
              onChange={e => setForm({ ...form, expires_days: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border rounded-lg hover:bg-gray-50" disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50" disabled={saving}>
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
