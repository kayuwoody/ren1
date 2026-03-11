'use client';

import React from 'react';
import { useBranch } from '@/context/branchContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentBranch, isLoading } = useBranch();

  return (
    <div>
      {!isLoading && currentBranch && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 flex items-center gap-2 text-sm text-blue-700">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          <span className="font-medium">{currentBranch.name}</span>
          {currentBranch.code && (
            <span className="text-blue-400">({currentBranch.code})</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
