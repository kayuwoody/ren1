import { NextResponse } from 'next/server';
import { getActiveBranches } from '@/lib/db/branchService';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const branches = getActiveBranches();
    return NextResponse.json(branches);
  } catch (error) {
    return handleApiError(error, '/api/admin/branches');
  }
}
