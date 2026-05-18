import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';
import { listAssignmentsForAdmin } from '@/lib/cpQueries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('q') || '';
  const rmFilter = searchParams.get('rm') || null;

  const sql = neon(process.env.DATABASE_URL);
  const [assignments, rms] = await Promise.all([
    listAssignmentsForAdmin({ search, rmFilter }),
    sql`SELECT id, name, email FROM users WHERE role = 'rm' AND is_active = true ORDER BY name`,
  ]);
  return NextResponse.json({ assignments, rms });
}
