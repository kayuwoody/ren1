import { NextResponse } from 'next/server';
import { getBranch, updateBranch, setDefaultBranch } from '@/lib/db/branchService';
import { handleApiError } from '@/lib/api/error-handler';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const branch = getBranch(id);
    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
    return NextResponse.json(branch);
  } catch (error) {
    return handleApiError(error, `/api/admin/branches/[id]`);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { setDefault, ...data } = body;

    if (setDefault) {
      setDefaultBranch(id);
    }

    const branch = updateBranch(id, data);
    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
    return NextResponse.json(branch);
  } catch (error) {
    return handleApiError(error, `/api/admin/branches/[id]`);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const branch = updateBranch(id, { isActive: false });
    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
    return NextResponse.json({ success: true, branch });
  } catch (error) {
    return handleApiError(error, `/api/admin/branches/[id]`);
  }
}
