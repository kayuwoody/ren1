/**
 * Branch Service
 *
 * CRUD operations for managing branches
 */

import { db } from './init';
import { v4 as uuidv4 } from 'uuid';

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToBranch(row: any): Branch {
  return {
    ...row,
    isDefault: row.isDefault === 1,
    isActive: row.isActive === 1,
  };
}

export function getAllBranches(): Branch[] {
  const rows = db.prepare('SELECT * FROM Branch ORDER BY isDefault DESC, name').all() as any[];
  return rows.map(rowToBranch);
}

export function getActiveBranches(): Branch[] {
  const rows = db.prepare('SELECT * FROM Branch WHERE isActive = 1 ORDER BY isDefault DESC, name').all() as any[];
  return rows.map(rowToBranch);
}

export function getBranch(id: string): Branch | null {
  const row = db.prepare('SELECT * FROM Branch WHERE id = ?').get(id) as any;
  return row ? rowToBranch(row) : null;
}

export function getDefaultBranch(): Branch {
  const row = db.prepare('SELECT * FROM Branch WHERE isDefault = 1 AND isActive = 1').get() as any;
  if (row) return rowToBranch(row);

  // Fallback: return any active branch
  const fallback = db.prepare('SELECT * FROM Branch WHERE isActive = 1 ORDER BY createdAt LIMIT 1').get() as any;
  if (fallback) return rowToBranch(fallback);

  // Last resort: return the seeded main branch
  return {
    id: 'branch-main',
    name: 'Main Branch',
    code: 'MAIN',
    isDefault: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createBranch(data: { name: string; code: string; address?: string; phone?: string }): Branch {
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO Branch (id, name, code, address, phone, isDefault, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)
  `).run(id, data.name, data.code, data.address || null, data.phone || null, now, now);

  return getBranch(id)!;
}

export function updateBranch(id: string, data: Partial<Pick<Branch, 'name' | 'code' | 'address' | 'phone' | 'isActive'>>): Branch | null {
  const branch = getBranch(id);
  if (!branch) return null;

  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.code !== undefined) { fields.push('code = ?'); values.push(data.code); }
  if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address || null); }
  if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone || null); }
  if (data.isActive !== undefined) { fields.push('isActive = ?'); values.push(data.isActive ? 1 : 0); }

  if (fields.length === 0) return branch;

  fields.push('updatedAt = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE Branch SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getBranch(id);
}

export function setDefaultBranch(id: string): void {
  const setDefault = db.transaction(() => {
    db.prepare('UPDATE Branch SET isDefault = 0').run();
    db.prepare('UPDATE Branch SET isDefault = 1 WHERE id = ?').run(id);
  });
  setDefault();
}
