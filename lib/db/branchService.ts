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

function mapRow(row: any): Branch {
  return {
    ...row,
    isDefault: row.isDefault === 1,
    isActive: row.isActive === 1,
  };
}

export function getAllBranches(): Branch[] {
  return (db.prepare('SELECT * FROM Branch ORDER BY isDefault DESC, name').all() as any[]).map(mapRow);
}

export function getActiveBranches(): Branch[] {
  return (db.prepare('SELECT * FROM Branch WHERE isActive = 1 ORDER BY isDefault DESC, name').all() as any[]).map(mapRow);
}

export function getBranch(id: string): Branch | null {
  const row = db.prepare('SELECT * FROM Branch WHERE id = ?').get(id) as any;
  return row ? mapRow(row) : null;
}

export function getDefaultBranch(): Branch {
  const row = db.prepare('SELECT * FROM Branch WHERE isDefault = 1 LIMIT 1').get() as any;
  if (row) return mapRow(row);
  // Fallback — return the first active branch
  const first = db.prepare('SELECT * FROM Branch WHERE isActive = 1 LIMIT 1').get() as any;
  if (first) return mapRow(first);
  throw new Error('No branches found in database');
}

export function createBranch(data: {
  name: string;
  code: string;
  address?: string;
  phone?: string;
}): Branch {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO Branch (id, name, code, address, phone, isDefault, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)
  `).run(id, data.name, data.code.toUpperCase(), data.address || null, data.phone || null, now, now);
  return getBranch(id)!;
}

export function updateBranch(id: string, data: Partial<Pick<Branch, 'name' | 'code' | 'address' | 'phone' | 'isActive'>>): Branch | null {
  const branch = getBranch(id);
  if (!branch) return null;

  const now = new Date().toISOString();
  const fields: string[] = ['updatedAt = ?'];
  const values: any[] = [now];

  if (data.name !== undefined) { fields.unshift('name = ?'); values.unshift(data.name); }
  if (data.code !== undefined) { fields.unshift('code = ?'); values.unshift(data.code.toUpperCase()); }
  if (data.address !== undefined) { fields.unshift('address = ?'); values.unshift(data.address); }
  if (data.phone !== undefined) { fields.unshift('phone = ?'); values.unshift(data.phone); }
  if (data.isActive !== undefined) { fields.unshift('isActive = ?'); values.unshift(data.isActive ? 1 : 0); }

  values.push(id);
  db.prepare(`UPDATE Branch SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getBranch(id);
}

export function setDefaultBranch(id: string): void {
  db.prepare('UPDATE Branch SET isDefault = 0').run();
  db.prepare('UPDATE Branch SET isDefault = 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), id);
}
