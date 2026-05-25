import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';

export const runtime = 'nodejs';

// POST /api/admin/insights/items/save
// Body: { source_insight_id, scope, item: { label, value?, note?, meeting_ids? } }
// Saves a single bullet from an AI insight's items list so admins can pin
// specific takeaways without freezing the whole insight.
export async function POST(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const sourceId = body?.source_insight_id || null;
  const scope = body?.scope;
  const item = body?.item;
  if (!scope || !item || typeof item.label !== 'string') {
    return NextResponse.json({ error: 'scope and item.label are required' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL);

  // Look up the parent title (for display even after the parent is regenerated
  // or deleted). Non-blocking — if the parent is gone we just skip the title.
  let sourceTitle = null;
  if (sourceId) {
    try {
      const [parent] = await sql`SELECT title FROM insights WHERE id = ${sourceId}`;
      sourceTitle = parent?.title || null;
    } catch {}
  }

  // Dedupe: if the admin already saved this same (source, label) combo,
  // return the existing row instead of inserting a duplicate.
  if (sourceId) {
    const existing = await sql`
      SELECT id, source_insight_id, source_title, scope, item, saved_by, saved_at
      FROM saved_insight_items
      WHERE source_insight_id = ${sourceId} AND item->>'label' = ${item.label}
      LIMIT 1
    `;
    if (existing[0]) {
      return NextResponse.json({ ok: true, item: existing[0], existed: true });
    }
  }

  const [row] = await sql`
    INSERT INTO saved_insight_items (source_insight_id, source_title, scope, item, saved_by)
    VALUES (${sourceId}, ${sourceTitle}, ${scope}, ${JSON.stringify(item)}::jsonb, ${session.user.id}::uuid)
    RETURNING id, source_insight_id, source_title, scope, item, saved_by, saved_at
  `;
  return NextResponse.json({ ok: true, item: row });
}
