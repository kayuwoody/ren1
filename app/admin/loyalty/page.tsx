'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Star, QrCode, Settings, Users, Gift, ChevronRight, Plus, ExternalLink, Ticket, Search, X, Check } from 'lucide-react';

interface LoyaltyProgram {
  id: string;
  name: string;
  description: string | null;
  trigger_type: 'scan' | 'purchase' | 'manual' | 'pass';
  points_per_trigger: number;
  points_per_rm: number | null;
  threshold: number;
  voucher_type: 'fixed' | 'percent';
  voucher_discount_value: number;
  voucher_validity_days: number;
  voucher_min_order: number | null;
  pass_type: 'use_based' | 'time_based' | null;
  pass_product_id: string | null;
  is_active: boolean;
  sort_order: number;
}

interface Member {
  id: string;
  phone: string;
  name: string | null;
  enrolled_at: string;
  updated_at: string;
}

interface MemberBalance {
  id: string;
  program_id: string;
  points_balance: number;
  total_earned: number;
  loyalty_programs: { name: string; threshold: number; trigger_type: string } | null;
}

interface ScanResult {
  member: Member;
  results: Array<{
    program_id: string;
    program_name: string;
    points_added: number;
    new_balance: number;
    vouchers_issued: any[];
  }>;
  balances: MemberBalance[];
}

export default function LoyaltyPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'scan' | 'members' | 'programs'>('scan');
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [scanPhone, setScanPhone] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showCreateProgram, setShowCreateProgram] = useState(false);
  const [programProducts, setProgramProducts] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetchPrograms();
  }, []);

  useEffect(() => {
    if (tab === 'members') fetchMembers();
  }, [tab, memberSearch]);

  async function fetchPrograms() {
    const res = await fetch('/api/loyalty/config');
    if (res.ok) {
      const data = await res.json();
      setPrograms(data.programs);
      const passPrograms = (data.programs as LoyaltyProgram[]).filter(p => p.trigger_type === 'pass');
      for (const p of passPrograms) {
        const r = await fetch(`/api/loyalty/program-products?program_id=${p.id}`);
        if (r.ok) {
          const d = await r.json();
          setProgramProducts(prev => ({ ...prev, [p.id]: d.product_ids }));
        }
      }
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

  async function toggleProgram(program: LoyaltyProgram) {
    await fetch('/api/loyalty/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: program.id, is_active: !program.is_active }),
    });
    fetchPrograms();
  }

  const scanPrograms = programs.filter(p => p.trigger_type === 'scan' && p.is_active);

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
                <p className="text-sm text-gray-500">
                  {programs.filter(p => p.is_active).length} active program{programs.filter(p => p.is_active).length !== 1 ? 's' : ''}
                </p>
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
            {(['scan', 'members', 'programs'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium capitalize ${
                  tab === t ? 'bg-gray-50 text-blue-600 border border-b-0' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'scan' && <QrCode className="w-4 h-4 inline mr-1.5" />}
                {t === 'members' && <Users className="w-4 h-4 inline mr-1.5" />}
                {t === 'programs' && <Settings className="w-4 h-4 inline mr-1.5" />}
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
              {scanPrograms.length === 0 && (
                <p className="text-sm text-orange-600 bg-orange-50 rounded-lg p-3 mb-4">
                  No active scan programs. Create one in the Programs tab.
                </p>
              )}
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
                  disabled={scanning || !scanPhone.trim() || scanPrograms.length === 0}
                  className="w-full py-3 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 disabled:opacity-50"
                >
                  {scanning ? 'Processing...' : 'Add Points'}
                </button>
              </form>
            </div>

            {scanResult && (
              <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <div className="text-center">
                  <p className="text-green-600 font-semibold text-lg">Scan recorded!</p>
                  <p className="text-gray-600">
                    {scanResult.member.name || scanResult.member.phone}
                  </p>
                </div>

                {scanResult.results.map(r => (
                  <div key={r.program_id} className="bg-yellow-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-yellow-800">{r.program_name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm text-yellow-700">+{r.points_added} point{r.points_added !== 1 ? 's' : ''}</span>
                      <span className="text-lg font-bold text-yellow-600">{r.new_balance} pts</span>
                    </div>
                    {r.vouchers_issued.length > 0 && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <Gift className="w-6 h-6 text-green-600 mx-auto mb-1" />
                        <p className="font-semibold text-green-800 text-sm">Voucher Issued!</p>
                        {r.vouchers_issued.map((v: any) => (
                          <p key={v.id} className="text-lg font-mono font-bold text-green-700">{v.code}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setScanResult(null); setScanPhone(''); }}
                    className="flex-1 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    Scan Another
                  </button>
                  <Link
                    href={`/admin/loyalty/members/${scanResult.member.id}`}
                    className="flex-1 py-2 border rounded-lg text-blue-600 hover:bg-blue-50 text-center flex items-center justify-center gap-1"
                  >
                    View Profile
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
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
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Joined</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map(m => (
                    <tr
                      key={m.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/admin/loyalty/members/${m.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{m.name || '—'}</div>
                        <div className="text-sm text-gray-500">{m.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(m.enrolled_at).toLocaleDateString('en-MY')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right flex items-center justify-end gap-1">
                        {new Date(m.updated_at).toLocaleDateString('en-MY')}
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        No members found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'programs' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={() => setShowCreateProgram(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                New Program
              </button>
            </div>

            {programs.length === 0 && (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                <Settings className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No programs yet. Create one to get started.</p>
              </div>
            )}

            {programs.map(p => (
              <ProgramCard
                key={p.id}
                program={p}
                eligibleProducts={programProducts[p.id] || []}
                onToggle={() => toggleProgram(p)}
                onProductsUpdated={fetchPrograms}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateProgram && (
        <CreateProgramModal
          onClose={() => setShowCreateProgram(false)}
          onCreated={() => { setShowCreateProgram(false); fetchPrograms(); }}
        />
      )}
    </div>
  );
}

function ProgramCard({ program: p, eligibleProducts, onToggle, onProductsUpdated }: {
  program: LoyaltyProgram;
  eligibleProducts: string[];
  onToggle: () => void;
  onProductsUpdated: () => void;
}) {
  const isPass = p.trigger_type === 'pass';
  const [allProducts, setAllProducts] = useState<CatalogProduct[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [triggerProductName, setTriggerProductName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!isPass) return;
    fetch('/api/products')
      .then(r => r.json())
      .then(data => {
        const prods = data.products || [];
        setAllProducts(prods);
        const map: Record<string, string> = {};
        for (const prod of prods) {
          if (eligibleProducts.includes(prod.id)) {
            map[prod.id] = prod.name;
          }
          if (p.pass_product_id && prod.id === p.pass_product_id) {
            setTriggerProductName(prod.name);
          }
        }
        setProductNames(map);
      })
      .catch(() => {});
  }, [isPass, eligibleProducts, p.pass_product_id]);

  return (
    <>
      <div className={`bg-white rounded-lg shadow p-5 ${!p.is_active ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{p.name}</h3>
              <span className={`px-2 py-0.5 rounded text-xs ${
                p.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {p.is_active ? 'Active' : 'Disabled'}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs capitalize ${
                isPass ? 'bg-teal-100 text-teal-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {isPass ? (p.pass_type === 'time_based' ? 'time pass' : 'use pass') : p.trigger_type}
              </span>
            </div>
            {p.description && <p className="text-sm text-gray-500 mt-1">{p.description}</p>}
          </div>
          <button
            onClick={onToggle}
            className={`px-3 py-1 text-sm rounded ${
              p.is_active ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {p.is_active ? 'Disable' : 'Enable'}
          </button>
        </div>

        {isPass ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Uses per pass</p>
                <p className="font-medium">{p.points_per_trigger}</p>
              </div>
              <div>
                <p className="text-gray-500">Pass type</p>
                <p className="font-medium capitalize">{p.pass_type?.replace('_', '-') || '—'}</p>
              </div>
              {triggerProductName && (
                <div>
                  <p className="text-gray-500">Sold as</p>
                  <p className="font-medium">{triggerProductName}</p>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">Eligible products ({eligibleProducts.length})</p>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                >
                  Edit Products
                </button>
              </div>
              {eligibleProducts.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {eligibleProducts.map(pid => (
                    <span key={pid} className="px-2 py-0.5 bg-teal-50 text-teal-700 text-xs rounded">
                      {productNames[pid] || pid.slice(0, 8)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-orange-500">No products linked — click Edit Products to add</p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
            <div>
              <p className="text-gray-500">Points/trigger</p>
              <p className="font-medium">{p.points_per_trigger}</p>
            </div>
            <div>
              <p className="text-gray-500">Threshold</p>
              <p className="font-medium">{p.threshold} pts</p>
            </div>
            <div>
              <p className="text-gray-500">Reward</p>
              <p className="font-medium">
                {p.voucher_type === 'fixed' ? `RM ${p.voucher_discount_value.toFixed(2)}` : `${p.voucher_discount_value}%`} off
              </p>
            </div>
            <div>
              <p className="text-gray-500">Voucher valid</p>
              <p className="font-medium">{p.voucher_validity_days} days</p>
          </div>
        </div>
      )}
    </div>

    {editing && (
      <EditProductsModal
        programId={p.id}
        programName={p.name}
        currentProductIds={eligibleProducts}
        allProducts={allProducts}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); onProductsUpdated(); }}
      />
    )}
    </>
  );
}

function EditProductsModal({ programId, programName, currentProductIds, allProducts, onClose, onSaved }: {
  programId: string;
  programName: string;
  currentProductIds: string[];
  allProducts: CatalogProduct[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(currentProductIds);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/loyalty/program-products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program_id: programId, product_ids: selected }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  }

  const added = selected.filter(id => !currentProductIds.includes(id));
  const removed = currentProductIds.filter(id => !selected.includes(id));
  const hasChanges = added.length > 0 || removed.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-1">Edit Eligible Products</h2>
        <p className="text-sm text-gray-500 mb-4">{programName} — {selected.length} selected</p>

        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            placeholder="Search products..."
            autoFocus
          />
        </div>

        <div className="border rounded-lg max-h-64 overflow-y-auto mb-4">
          {filtered.length === 0 ? (
            <p className="p-3 text-sm text-gray-400 text-center">No products found</p>
          ) : (
            filtered.map(p => {
              const isSelected = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 ${
                    isSelected ? 'bg-teal-50' : ''
                  }`}
                >
                  <span className={isSelected ? 'text-teal-700 font-medium' : 'text-gray-700'}>
                    {p.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs">RM {p.basePrice.toFixed(2)}</span>
                    {isSelected && <Check className="w-4 h-4 text-teal-600" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {selected.map(id => {
              const prod = allProducts.find(x => x.id === id);
              return (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded">
                  {prod?.name || id.slice(0, 8)}
                  <button type="button" onClick={() => toggle(id)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border rounded-lg hover:bg-gray-50" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex-1 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : `Save (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CatalogProduct {
  id: string;
  name: string;
  basePrice: number;
  category: string;
}

function CreateProgramModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger_type: 'scan' as 'scan' | 'purchase' | 'manual' | 'pass',
    points_per_trigger: '1',
    threshold: '10',
    voucher_type: 'fixed' as 'fixed' | 'percent',
    voucher_discount_value: '5',
    voucher_validity_days: '90',
    voucher_min_order: '',
    pass_type: 'use_based' as 'use_based' | 'time_based',
    pass_product_id: '',
    eligible_product_ids: [] as string[],
  });
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');

  const isPass = form.trigger_type === 'pass';

  useEffect(() => {
    if (isPass && products.length === 0) {
      fetch('/api/products')
        .then(r => r.json())
        .then(data => setProducts(data.products || []))
        .catch(() => {});
    }
  }, [isPass, products.length]);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  function toggleEligibleProduct(id: string) {
    setForm(prev => ({
      ...prev,
      eligible_product_ids: prev.eligible_product_ids.includes(id)
        ? prev.eligible_product_ids.filter(x => x !== id)
        : [...prev.eligible_product_ids, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload: any = {
        name: form.name,
        description: form.description || null,
        trigger_type: form.trigger_type,
        points_per_trigger: parseInt(form.points_per_trigger) || 1,
      };

      if (isPass) {
        payload.pass_type = form.pass_type;
        payload.pass_product_id = form.pass_product_id || null;
        payload.eligible_product_ids = form.eligible_product_ids;
      } else {
        payload.threshold = parseInt(form.threshold) || 10;
        payload.voucher_type = form.voucher_type;
        payload.voucher_discount_value = parseFloat(form.voucher_discount_value) || 0;
        payload.voucher_validity_days = parseInt(form.voucher_validity_days) || 90;
        payload.voucher_min_order = form.voucher_min_order ? parseFloat(form.voucher_min_order) : null;
      }

      const res = await fetch('/api/loyalty/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create program');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">New Loyalty Program</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Program Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder={isPass ? 'e.g. 5 Drink Pass' : 'e.g. Visit Stamps'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder={isPass ? 'e.g. Redeem 5 drinks from eligible menu' : 'e.g. Earn 1 stamp per visit'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Program Type</label>
            <select
              value={form.trigger_type}
              onChange={e => setForm({ ...form, trigger_type: e.target.value as any })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="scan">Scan (POS QR scan)</option>
              <option value="purchase">Purchase (auto on payment)</option>
              <option value="manual">Manual (staff awards)</option>
              <option value="pass">Pass (drink/product pass)</option>
            </select>
          </div>

          {isPass ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Uses Per Pass</label>
                  <input
                    type="number"
                    min="1"
                    value={form.points_per_trigger}
                    onChange={e => setForm({ ...form, points_per_trigger: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pass Type</label>
                  <select
                    value={form.pass_type}
                    onChange={e => setForm({ ...form, pass_type: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="use_based">Use-based (top-up allowed)</option>
                    <option value="time_based">Time-based (no top-up while active)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trigger Product
                  <span className="text-gray-400 font-normal ml-1">(product that creates this pass when purchased)</span>
                </label>
                <select
                  value={form.pass_product_id}
                  onChange={e => setForm({ ...form, pass_product_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">— None (manual creation only) —</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — RM {p.basePrice.toFixed(2)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Eligible Products
                  <span className="text-gray-400 font-normal ml-1">({form.eligible_product_ids.length} selected)</span>
                </label>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
                    placeholder="Search products..."
                  />
                </div>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <p className="p-3 text-sm text-gray-400 text-center">No products found</p>
                  ) : (
                    filteredProducts.map(p => {
                      const selected = form.eligible_product_ids.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleEligibleProduct(p.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 ${
                            selected ? 'bg-teal-50' : ''
                          }`}
                        >
                          <span className={selected ? 'text-teal-700 font-medium' : 'text-gray-700'}>
                            {p.name}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs">RM {p.basePrice.toFixed(2)}</span>
                            {selected && <Check className="w-4 h-4 text-teal-600" />}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {form.eligible_product_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {form.eligible_product_ids.map(id => {
                      const p = products.find(x => x.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded">
                          {p?.name || id.slice(0, 8)}
                          <button type="button" onClick={() => toggleEligibleProduct(id)}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Points Per Trigger</label>
                  <input
                    type="number"
                    min="1"
                    value={form.points_per_trigger}
                    onChange={e => setForm({ ...form, points_per_trigger: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Threshold (pts)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.threshold}
                    onChange={e => setForm({ ...form, threshold: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <hr />
              <h3 className="font-medium text-gray-700">Reward Voucher</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                  <select
                    value={form.voucher_type}
                    onChange={e => setForm({ ...form, voucher_type: e.target.value as 'fixed' | 'percent' })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="fixed">Fixed (RM)</option>
                    <option value="percent">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value {form.voucher_type === 'fixed' ? '(RM)' : '(%)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.voucher_discount_value}
                    onChange={e => setForm({ ...form, voucher_discount_value: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid For (days)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.voucher_validity_days}
                    onChange={e => setForm({ ...form, voucher_validity_days: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Order (RM)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.voucher_min_order}
                    onChange={e => setForm({ ...form, voucher_min_order: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="None"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border rounded-lg hover:bg-gray-50" disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" disabled={saving}>
              {saving ? 'Creating...' : 'Create Program'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
