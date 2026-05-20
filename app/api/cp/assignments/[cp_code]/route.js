import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/cp/assignments/CP01234
// Body: { rm_id: '<uuid>' | null }
// Admin-only. Sets is_admin_override=true so future syncs don't undo it.
export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const cp_code = params.cp_code;
  if (!cp_code) return NextResponse.json({ error: 'cp_code required' }, { status: 400 });

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const rm_id = body.rm_id === '' ? null : body.rm_id || null;

  const sql = neon(process.env.DATABASE_URL);
  // Read the previous assignment so the log entry can show the diff.
  const prev = await sql`SELECT rm_id FROM cp_assignments WHERE cp_code = ${cp_code}`;
  const previousRmId = prev[0]?.rm_id || null;

  const rows = await sql`
    INSERT INTO cp_assignments (cp_code, rm_id, is_admin_override, source, updated_at, updated_by)
    VALUES (${cp_code}, ${rm_id}::uuid, true, 'admin', now(), ${session.user.id}::uuid)
    ON CONFLICT (cp_code) DO UPDATE SET
      rm_id = EXCLUDED.rm_id,
      is_admin_override = true,
      source = 'admin',
      updated_at = now(),
      updated_by = ${session.user.id}::uuid
    RETURNING cp_code, rm_id, is_admin_override
  `;

  logActivity({
    userId: session.user.id,
    eventType: 'cp.assignment_changed',
    cpCode: cp_code,
    payload: { from_rm_id: previousRmId, to_rm_id: rm_id },
    request,
  });

  return NextResponse.json({ ok: true, assignment: rows[0] });
}
