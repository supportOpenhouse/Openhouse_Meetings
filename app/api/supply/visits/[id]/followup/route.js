import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';

export const runtime = 'nodejs';

const sql = neon(process.env.DATABASE_URL);

// POST /api/supply/visits/[id]/followup   body: { done?: boolean }  (default true)
// Marks this visit's follow-up complete (or reopens it with { done: false }).
// Only the rep who logged the visit, or an admin. The scheduled date + action
// are left intact — we only stamp followup_done_at.
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* empty body → mark done */
  }
  const done = body.done !== false;

  const rows = await sql`SELECT sales_rm_id FROM sales_visits WHERE id = ${id}::uuid`;
  if (!rows.length) return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
  if (rows[0].sales_rm_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updated = await sql`
    UPDATE sales_visits
    SET followup_done_at = ${done ? new Date().toISOString() : null}
    WHERE id = ${id}::uuid
    RETURNING id, followup_done_at
  `;

  return NextResponse.json({ ok: true, id: updated[0].id, followup_done_at: updated[0].followup_done_at });
}
