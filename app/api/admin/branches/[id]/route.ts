import { NextResponse } from 'next/server';
import { getBranch, updateBranch, setDefaultBranch } from '@/lib/db/branchService';
import { handleApiError } from '@/lib/api/error-handler';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const branch = getBranch(params.id);
    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
    return NextResponse.json(branch);
  } catch (error) {
    return handleApiError(error, `/api/admin/branches/${params.id}`);
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { setDefault, ...data } = body;

    if (setDefault) {
      setDefaultBranch(params.id);
    }

    const branch = updateBranch(params.id, data);
    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
    return NextResponse.json(branch);
  } catch (error) {
    return handleApiError(error, `/api/admin/branches/${params.id}`);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const branch = updateBranch(params.id, { isActive: false });
    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
    return NextResponse.json({ success: true, branch });
  } catch (error) {
    return handleApiError(error, `/api/admin/branches/${params.id}`);
  }
}
