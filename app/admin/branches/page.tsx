'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, Plus, Pencil, Check, X, Star } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export default function BranchManagementPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({ name: '', code: '', address: '', phone: '' });
  const [editForm, setEditForm] = useState({ name: '', code: '', address: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBranches();
  }, []);

  async function loadBranches() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/branches');
      if (res.ok) setBranches(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create branch');
        return;
      }
      setForm({ name: '', code: '', address: '', phone: '' });
      setShowCreate(false);
      await loadBranches();
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        await loadBranches();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault(id: string) {
    await fetch(`/api/admin/branches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setDefault: true }),
    });
    await loadBranches();
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    await fetch(`/api/admin/branches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    await loadBranches();
  }

  function startEdit(branch: Branch) {
    setEditingId(branch.id);
    setEditForm({ name: branch.name, code: branch.code, address: branch.address || '', phone: branch.phone || '' });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Building2 className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Branch Management</h1>
        </div>

        {/* Create branch form */}
        <div className="bg-white rounded-lg shadow-sm border mb-6 p-4">
          {showCreate ? (
            <form onSubmit={handleCreate} className="space-y-3">
              <h2 className="font-semibold text-gray-800">New Branch</h2>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Branch Name *</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Main Branch" required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Branch Code *</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                    placeholder="e.g. KL1" required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Address</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Phone</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
                  Create Branch
                </button>
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              <Plus className="w-4 h-4" /> Add Branch
            </button>
          )}
        </div>

        {/* Branches list */}
        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <div className="space-y-3">
            {branches.map(branch => (
              <div key={branch.id} className={`bg-white rounded-lg shadow-sm border p-4 ${!branch.isActive ? 'opacity-60' : ''}`}>
                {editingId === branch.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Name</label>
                        <input className="w-full border rounded px-3 py-2 text-sm" value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Code</label>
                        <input className="w-full border rounded px-3 py-2 text-sm" value={editForm.code}
                          onChange={e => setEditForm({ ...editForm, code: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Address</label>
                        <input className="w-full border rounded px-3 py-2 text-sm" value={editForm.address}
                          onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Phone</label>
                        <input className="w-full border rounded px-3 py-2 text-sm" value={editForm.phone}
                          onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdate(branch.id)} disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50">
                        <Check className="w-3 h-3" /> Save
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{branch.name}</span>
                        <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-mono">{branch.code}</span>
                        {branch.isDefault && (
                          <span className="flex items-center gap-0.5 text-amber-600 text-xs">
                            <Star className="w-3 h-3 fill-amber-500" /> Default
                          </span>
                        )}
                        {!branch.isActive && (
                          <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">Inactive</span>
                        )}
                      </div>
                      {branch.address && <p className="text-sm text-gray-500 mt-0.5">{branch.address}</p>}
                      {branch.phone && <p className="text-sm text-gray-500">{branch.phone}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {!branch.isDefault && (
                        <button onClick={() => handleSetDefault(branch.id)}
                          className="text-xs text-amber-600 hover:text-amber-800 border border-amber-300 px-2 py-1 rounded">
                          Set Default
                        </button>
                      )}
                      <button onClick={() => startEdit(branch)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleToggleActive(branch.id, branch.isActive)}
                        className={`text-xs px-2 py-1 rounded border ${branch.isActive
                          ? 'text-red-600 border-red-300 hover:bg-red-50'
                          : 'text-green-600 border-green-300 hover:bg-green-50'}`}>
                        {branch.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
