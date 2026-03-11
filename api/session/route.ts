import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { wcApi } from '@/lib/wooClient';

export async function GET() {
  const userId = cookies().get('userId')?.value;
  if (userId) {
    try {
      const { data } = (await wcApi.get(`customers/${userId}`)) as { data: any };
      return NextResponse.json({ userId: Number(userId), email: data?.email });
    } catch {
      // stale cookie; ignore
    }
  }
  return NextResponse.json({ userId: null });
}
