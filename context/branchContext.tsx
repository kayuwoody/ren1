'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isDefault: boolean;
  isActive: boolean;
}

interface BranchContextValue {
  currentBranch: Branch | null;
  branches: Branch[];
  setBranch: (branchId: string) => void;
  isLoading: boolean;
  branchFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const BranchContext = createContext<BranchContextValue | null>(null);

const SESSION_KEY = 'current_branch_id';

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/branches');
        if (!res.ok) return;
        const data: Branch[] = await res.json();
        const active = data.filter(b => b.isActive);
        setBranches(active);

        const stored = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null;
        const found = stored ? active.find(b => b.id === stored) : null;
        const defaultBranch = found || active.find(b => b.isDefault) || active[0] || null;
        setCurrentBranch(defaultBranch);
        if (defaultBranch && typeof window !== 'undefined') {
          sessionStorage.setItem(SESSION_KEY, defaultBranch.id);
        }
      } catch (e) {
        console.error('Failed to load branches', e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const setBranch = useCallback((branchId: string) => {
    const branch = branches.find(b => b.id === branchId);
    if (branch) {
      setCurrentBranch(branch);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_KEY, branchId);
      }
    }
  }, [branches]);

  const branchFetch = useCallback((url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        'X-Branch-Id': currentBranch?.id || '',
      },
    });
  }, [currentBranch]);

  return (
    <BranchContext.Provider value={{ currentBranch, branches, setBranch, isLoading, branchFetch }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within a BranchProvider');
  return ctx;
}
