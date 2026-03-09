/**
 * Branch Helper
 *
 * Extract branchId from API requests with validation
 */

import { getDefaultBranch, getBranch } from '@/lib/db/branchService';

export function getBranchIdFromRequest(request: Request): string {
  const branchId = request.headers.get('X-Branch-Id');

  if (!branchId) {
    return getDefaultBranch().id;
  }

  // Validate that the branch exists
  const branch = getBranch(branchId);
  if (!branch) {
    console.warn(`Invalid branchId "${branchId}" in request, falling back to default`);
    return getDefaultBranch().id;
  }

  return branchId;
}
