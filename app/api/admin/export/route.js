import { auth } from '@/auth';
import { listAllMeetings } from '@/lib/queries';
import { fmtDuration } from '@/lib/utils';

export const runtime = 'nodejs';
// Larger exports can take a while when transcripts are pulled.
export const maxDuration = 60;

// GET /api/admin/export.csv?start=...&end=...&rm=...&city=...&search=...
// Returns a CSV of meetings matching the filters. Admin only.
export async function GET(request) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const startStr = searchParams.get('start');
  const endStr = searchParams.get('end');
  const rmFilter = searchParams.get('rm') || null;
  const city = searchParams.get('city') || null;
  const search = searchParams.get('search') || null;

  const filters = {
    rmFilter,
    city,
    search,
    includeTranscript: true,
  };
  if (startStr) {
    const d = new Date(startStr);
    if (!isNaN(d)) filters.since = d;
  }
  if (endStr) {
    const d = new Date(endStr);
    if (!isNaN(d)) filters.until = d;
  }

  const rows = await listAllMeetings(filters);

  const headers = [
    'Date Added',
    'Meeting Started',
    'CP Code',
    'CP Name',
    'CP Number',
    'City',
    'RM',
    'RM Email',
    'Duration',
    'Duration (seconds)',
    'Language',
    'Sentiment',
    'Summary',
    'Questions',
    'Transcript',
    'Audio URL',
    'Purpose',
  ];

  const csvRows = [headers.map(csvCell).join(',')];

  for (const m of rows) {
    const summary = m.summary || {};
    const questions = Array.isArray(summary.questions)
      ? summary.questions.join(' | ')
      : (typeof summary.questions === 'string' ? summary.questions : '');
    const summaryText =
      summary.tl_dr ||
      summary.summary ||
      summary.tldr ||
      (typeof summary === 'string' ? summary : '');

    csvRows.push(
      [
        toIsoDate(m.created_at),
        toIsoDate(m.started_at),
        m.cp_code || '',
        m.cp_name || '',
        m.cp_mobile || '',
        m.cp_city || '',
        m.rm_name || '',
        m.rm_email || '',
        fmtDuration(m.duration_seconds || 0),
        m.duration_seconds || 0,
        m.language || '',
        summary.sentiment || '',
        summaryText,
        questions,
        m.transcript_text || '',
        m.audio_url || '',
        m.purpose || '',
      ]
        .map(csvCell)
        .join(',')
    );
  }

  // Prefix with UTF-8 BOM so Excel renders Unicode (e.g. Hindi/Devanagari) correctly.
  const body = '﻿' + csvRows.join('\r\n') + '\r\n';
  const filename = `openhouse-meetings-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Quote anything that contains a delimiter, quote, or newline; double internal quotes.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toIsoDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return '';
  return dt.toISOString();
}
