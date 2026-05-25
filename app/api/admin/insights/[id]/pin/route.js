import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';

export const runtime = 'nodejs';

// POST /api/admin/insights/[id]/pin
// Marks a specific generated insight as "saved" so it survives future
// regenerations. Body: { pinned?: boolean } — defaults to true.
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;

  let body = {};
  try { body = await request.json(); } catch {}
  const pinned = body?.pinned === false ? false : true;

  const sql = neon(process.env.DATABASE_URL);
  const [row] = await sql`
    UPDATE insights SET pinned = ${pinned} WHERE id = ${id}
    RETURNING id, scope, insight_key, title, question, result, meeting_count,
              period_days, generated_at, pinned
  `;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, insight: row });
}
