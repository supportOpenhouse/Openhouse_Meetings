import { auth } from '@/auth';
import { fetchInsightRecords } from '@/lib/insightsRecords';
import { csvResponse, meetingCsvHeaders, meetingCsvRow } from '@/lib/csv';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/admin/insights/export — CSV of the meetings behind an insights stat.
// Same params as /stat-meetings (type + temp|param|outcome|call_field/call_value
// + since/until/rm) for tab/section/stat exports, OR ids= for AI-insight exports.
// Returns ALL matching rows (no display cap). Admin only.
export async function GET(request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');
  const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const type = searchParams.get('type');
  if (!ids && !['visit', 'engagement', 'onboarding', 'call', 'negotiation'].includes(type)) {
    return new Response('invalid type', { status: 400 });
  }
  const rm = searchParams.get('rm');

  const rows = await fetchInsightRecords({
    type,
    temp: searchParams.get('temp') || null,
    param: searchParams.get('param') || null,
    outcome: searchParams.get('outcome') || null,
    callField: searchParams.get('call_field') || null,
    callValue: searchParams.get('call_value') || null,
    since: searchParams.get('since') || null,
    until: searchParams.get('until') || null,
    rmId: rm && rm !== 'all' ? rm : null,
    ids,
    limit: null,
  });

  // Visit exports get the 12 funnel steps flattened into Yes/No columns.
  const funnel = type === 'visit';
  const base = (searchParams.get('name') || 'insights').replace(/[^a-z0-9-_]/gi, '-');
  const filename = `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
  return csvResponse(filename, meetingCsvHeaders({ funnel }), rows.map((r) => meetingCsvRow(r, { funnel })));
}
