import { NextResponse } from 'next/server';
import { getAllBranches, createBranch } from '@/lib/db/branchService';
import { initBranchStockForNewBranch } from '@/lib/db/branchStockService';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function GET() {
  try {
    return NextResponse.json(getAllBranches());
  } catch (error) {
    return handleApiError(error, '/api/admin/branches');
  }
}

export async function POST(req: Request) {
  try {
    const { name, code, address, phone } = await req.json();
    if (!name || !code) {
      return validationError('name and code are required', '/api/admin/branches');
    }
    const branch = createBranch({ name, code, address, phone });
    initBranchStockForNewBranch(branch.id);
    return NextResponse.json(branch, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/admin/branches');
  }
}
