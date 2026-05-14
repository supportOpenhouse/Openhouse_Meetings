import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { overviewStats } from '@/lib/queries';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const stats = await overviewStats();
  return NextResponse.json(stats);
}
