import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/direct/check
// Body: { filenames: string[] }
// Returns { existing: string[] } — the filenames this RM has ALREADY uploaded,
// so the upload UI can skip them instead of re-transcribing (which costs
// ElevenLabs credits).
export async function POST(request) {
  const session = await auth();
  // Any signed-in user can check their OWN already-uploaded filenames — it's
  // scoped to their rm_id below. Used by both the direct-RM and RM uploaders.
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const filenames = Array.isArray(body?.filenames)
    ? body.filenames.filter((f) => typeof f === 'string' && f).slice(0, 200)
    : [];
  if (filenames.length === 0) return NextResponse.json({ existing: [] });

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT DISTINCT source_filename
    FROM meetings
    WHERE rm_id = ${session.user.id}
      AND source_filename = ANY(${filenames}::text[])
  `;
  return NextResponse.json({ existing: rows.map((r) => r.source_filename) });
}
