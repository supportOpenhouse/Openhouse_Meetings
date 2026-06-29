import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchSupplyVisits, toSupplyModalRow } from '@/lib/supplyRecords';
import { csvResponse, visitCsvHeaders, visitCsvRow } from '@/lib/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const allowed = (role) => role === 'admin' || role === 'supply_manager';

// GET /api/admin/supply/insights/records
// JSON (drill-down modal, capped) or ?format=csv (all rows). Selectors:
// outcome | stage | sentiment | engagement | meeting_type | ids, + since/until/rm_id.
export async function GET(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!allowed(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const idsParam = sp.get('ids');
  const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const rm = sp.get('rm_id');
  // Accept `period` (days) and derive `since` server-side — the client passes a
  // stable period so the export href doesn't depend on Date.now() at render.
  const period = parseInt(sp.get('period') || '', 10);
  let since = sp.get('since') || null;
  if (!since && Number.isFinite(period) && period > 0) {
    since = new Date(Date.now() - period * 86400000).toISOString();
  }
  const common = {
    outcome: sp.get('outcome') || null,
    stage: sp.get('stage') || null,
    sentiment: sp.get('sentiment') || null,
    engagement: sp.get('engagement') || null,
    meetingType: sp.get('meeting_type') || null,
    since,
    until: sp.get('until') || null,
    rmId: rm && rm !== 'all' ? rm : null,
    ids,
  };

  if (sp.get('format') === 'csv') {
    const rows = await fetchSupplyVisits({ ...common, limit: null });
    const base = (sp.get('name') || 'supply-visits').replace(/[^a-z0-9-_]/gi, '-');
    const filename = `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
    return csvResponse(filename, visitCsvHeaders(), rows.map(visitCsvRow));
  }

  const limit = Math.min(parseInt(sp.get('limit') || '50', 10) || 50, 200);
  const rows = await fetchSupplyVisits({ ...common, limit });
  return NextResponse.json({ visits: rows.map(toSupplyModalRow) });
}
