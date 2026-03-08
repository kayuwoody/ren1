import { getDefaultBranch } from '../db/branchService';

/**
 * Extract branchId from an incoming request.
 * Checks the X-Branch-Id header first; falls back to the default branch.
 */
export function getBranchIdFromRequest(request: Request): string {
  const branchId = request.headers.get('X-Branch-Id');
  if (branchId && branchId.trim()) {
    return branchId.trim();
  }
  return getDefaultBranch().id;
}
