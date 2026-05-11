'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Star, QrCode, Settings, Users, Gift, ChevronRight } from 'lucide-react';

interface LoyaltyConfig {
  points_per_scan: number;
  points_threshold: number;
  voucher_type: 'fixed' | 'percent';
  voucher_discount_value: number;
  voucher_validity_days: number;
  voucher_min_order: number;
  is_active: boolean;
}

interface Member {
  id: string;
  phone: string;
  name: string | null;
  points_balance: number;
  total_points_earned: number;
  created_at: string;
}

interface ScanResult {
  member: Member;
  points_added: number;
  voucher_issued: any;
  points_until_voucher: number;
}

export default function LoyaltyPage() {
  const [tab, setTab] = useState<'scan' | 'members' | 'config'>('scan');
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [scanPhone, setScanPhone] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configForm, setConfigForm] = useState<LoyaltyConfig | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (tab === 'members') fetchMembers();
  }, [tab, memberSearch]);

  async function fetchConfig() {
    const res = await fetch('/api/loyalty/config');
    if (res.ok) {
      const data = await res.json();
      setConfig(data);
      setConfigForm(data);
    }
  }

  async function fetchMembers() {
    const params = memberSearch ? `?search=${encodeURIComponent(memberSearch)}` : '';
    const res = await fetch(`/api/loyalty/members${params}`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!scanPhone.trim()) return;
    setScanning(true);
    setScanResult(null);

    try {
      const res = await fetch('/api/loyalty/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: scanPhone.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setScanResult(data);
      } else {
        alert(data.error || 'Scan failed');
      }
    } catch {
      alert('Failed to process scan');
    } finally {
      setScanning(false);
    }
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!configForm) return;
    setSaving(true);

    try {
      const res = await fetch('/api/loyalty/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      });
      if (res.ok) {
        setConfig(configForm);
        alert('Settings saved');
      } else {
        alert('Failed to save settings');
      }
    } catch {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Star className="w-6 h-6 text-yellow-500" />
                  Loyalty Program
                </h1>
                {config && (
                  <p className="text-sm text-gray-500">
                    {config.is_active ? 'Active' : 'Disabled'} — {config.points_per_scan} pt/scan, {config.points_threshold} pts for voucher
                  </p>
                )}
              </div>
            </div>
            <Link
              href="/admin/vouchers"
              className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100"
            >
              <Gift className="w-4 h-4" />
              Vouchers
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="flex gap-1 mt-4">
            {(['scan', 'members', 'config'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium capitalize ${
                  tab === t ? 'bg-gray-50 text-blue-600 border border-b-0' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'scan' && <QrCode className="w-4 h-4 inline mr-1.5" />}
                {t === 'members' && <Users className="w-4 h-4 inline mr-1.5" />}
                {t === 'config' && <Settings className="w-4 h-4 inline mr-1.5" />}
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'scan' && (
          <div className="max-w-lg mx-auto space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Scan Customer</h2>
              <form onSubmit={handleScan} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={scanPhone}
                    onChange={e => setScanPhone(e.target.value)}
                    className="w-full px-4 py-3 border rounded-lg text-lg"
                    placeholder="e.g. 0123456789"
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">Enter or scan the customer&apos;s phone number</p>
                </div>
                <button
                  type="submit"
                  disabled={scanning || !scanPhone.trim()}
                  className="w-full py-3 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 disabled:opacity-50"
                >
                  {scanning ? 'Processing...' : 'Add Points'}
                </button>
              </form>
            </div>

            {scanResult && (
              <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <div className="text-center">
                  <p className="text-green-600 font-semibold text-lg">
                    +{scanResult.points_added} point{scanResult.points_added !== 1 ? 's' : ''} added!
                  </p>
                  <p className="text-gray-600">
                    {scanResult.member.name || scanResult.member.phone}
                  </p>
                </div>

                <div className="bg-yellow-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-yellow-700">Current Balance</p>
                  <p className="text-3xl font-bold text-yellow-600">{scanResult.member.points_balance}</p>
                  <p className="text-xs text-yellow-600 mt-1">
                    {scanResult.points_until_voucher > 0
                      ? `${scanResult.points_until_voucher} more until next voucher`
                      : 'Voucher threshold reached!'}
                  </p>
                </div>

                {scanResult.voucher_issued && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <Gift className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="font-semibold text-green-800">Voucher Issued!</p>
                    <p className="text-2xl font-mono font-bold text-green-700 mt-1">
                      {scanResult.voucher_issued.code}
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      {scanResult.voucher_issued.type === 'fixed'
                        ? `RM ${scanResult.voucher_issued.discount_value} off`
                        : `${scanResult.voucher_issued.discount_value}% off`}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => { setScanResult(null); setScanPhone(''); }}
                  className="w-full py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Scan Another
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'members' && (
          <div className="space-y-4">
            <input
              type="text"
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="Search by phone or name..."
            />

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Member</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Balance</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total Earned</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{m.name || '—'}</div>
                        <div className="text-sm text-gray-500">{m.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-yellow-600">{m.points_balance}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{m.total_points_earned}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(m.created_at).toLocaleDateString('en-MY')}
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No members found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'config' && configForm && (
          <div className="max-w-lg mx-auto">
            <form onSubmit={saveConfig} className="bg-white rounded-lg shadow p-6 space-y-5">
              <h2 className="text-lg font-semibold">Program Settings</h2>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <label className="font-medium">Program Active</label>
                <input
                  type="checkbox"
                  checked={configForm.is_active}
                  onChange={e => setConfigForm({ ...configForm, is_active: e.target.checked })}
                  className="w-5 h-5 text-yellow-500 rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Points Per Scan</label>
                  <input
                    type="number"
                    min="1"
                    value={configForm.points_per_scan}
                    onChange={e => setConfigForm({ ...configForm, points_per_scan: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Points for Voucher</label>
                  <input
                    type="number"
                    min="1"
                    value={configForm.points_threshold}
                    onChange={e => setConfigForm({ ...configForm, points_threshold: parseInt(e.target.value) || 10 })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <hr />
              <h3 className="font-medium text-gray-700">Auto-Generated Voucher</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                  <select
                    value={configForm.voucher_type}
                    onChange={e => setConfigForm({ ...configForm, voucher_type: e.target.value as 'fixed' | 'percent' })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="fixed">Fixed (RM)</option>
                    <option value="percent">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Discount Value {configForm.voucher_type === 'fixed' ? '(RM)' : '(%)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={configForm.voucher_discount_value}
                    onChange={e => setConfigForm({ ...configForm, voucher_discount_value: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid For (days)</label>
                  <input
                    type="number"
                    min="1"
                    value={configForm.voucher_validity_days}
                    onChange={e => setConfigForm({ ...configForm, voucher_validity_days: parseInt(e.target.value) || 30 })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Order (RM)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={configForm.voucher_min_order}
                    onChange={e => setConfigForm({ ...configForm, voucher_min_order: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
