import { auth } from '@/auth';
import { listAllMeetings } from '@/lib/queries';
import { fmtDuration } from '@/lib/utils';
import { csvCell, listOrString, toIsoDate, meetingSummaryFields, mapsLink } from '@/lib/csv';

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
    // The CSV expands the AI summary into ~10 columns, so it needs the full
    // summary jsonb (lists get only list_sentiment after the Phase 6 trim).
    includeSummary: true,
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

  // Columns mirror the Claude summary schema in lib/claude.js (DEFAULT_QUESTIONS) so
  // every question becomes its own cell, plus a composed "Summary" cell for a quick read.
  const headers = [
    'Date Added',
    'Meeting Started',
    'CP Code',
    'CP Name',
    'CP Number',
    'City',
    'Latitude',
    'Longitude',
    'Map',
    'RM',
    'RM Email',
    'Duration',
    'Duration (seconds)',
    'Language',
    'Status',
    'Sentiment',
    'Summary',
    'Key Topics',
    'CP Requirements',
    'Properties Discussed',
    'Budget',
    'Objections',
    'Commitments',
    'Next Action',
    'Follow-up Date',
    'Transcript',
    'Audio URL',
    'Purpose',
  ];

  const csvRows = [headers.map(csvCell).join(',')];

  for (const m of rows) {
    // The summary jsonb nests its fields under the meeting_type key with varying
    // names per type — normalise so the columns aren't blank for visits/calls.
    const n = meetingSummaryFields(m.summary || {}, m.meeting_type);

    // Compose a human-readable "Summary" rollup from the meaty fields.
    const summaryRollup = [
      n.keyTopics && `Topics: ${listOrString(n.keyTopics)}`,
      n.requirements && `Needs: ${listOrString(n.requirements)}`,
      n.nextAction && `Next: ${listOrString(n.nextAction)}`,
    ]
      .filter(Boolean)
      .join(' · ');

    csvRows.push(
      [
        toIsoDate(m.created_at),
        toIsoDate(m.started_at),
        m.cp_code || '',
        m.cp_name || '',
        m.cp_mobile || '',
        m.cp_city || '',
        m.location_lat ?? '',
        m.location_lng ?? '',
        mapsLink(m.location_lat, m.location_lng),
        m.rm_name || '',
        m.rm_email || '',
        fmtDuration(m.duration_seconds || 0),
        m.duration_seconds || 0,
        m.language || '',
        m.status || '',
        n.sentiment,
        summaryRollup,
        listOrString(n.keyTopics),
        listOrString(n.requirements),
        listOrString(n.properties),
        listOrString(n.budget),
        listOrString(n.objections),
        listOrString(n.commitments),
        listOrString(n.nextAction),
        listOrString(n.followUp),
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
