// Reads the freshest visits straight from the CRM backend. The Google Sheet
// mirror lags the CRM by up to ~15 minutes, so a visit booked just before the
// RM arrives on site isn't in the sheet yet. We use this API only to fill
// that gap: the sheet covers everything up to its highest id, and this pulls
// every CRM visit with a larger id.
//
// API shape (GET /api/v1/oh/crm/all-visits/?limit=&offset=):
//   - rows are ordered by id ASCENDING (offset 0 = oldest visit)
//   - limit is capped at 50, no filters, no total count
//   - pagination: { limit, offset, nextOffset, hasMore }
// So "latest visits" means finding the tail of the list. Offsets don't match
// sheet row numbers (the CRM has rows the sheet doesn't), so the caller
// passes the sheet row count as a starting guess and we walk from there.
//
// Env required:
//   CRM_API_KEY   — sent as X-CRM-Key
//   CRM_API_BASE  — optional, defaults to the prod backend

const DEFAULT_BASE = 'https://backend-prod-561394753846.asia-south2.run.app';
const PAGE = 50;
// Hard cap on CRM calls per lookup so a bad offset guess can't turn one
// visit-picker load into hundreds of requests.
const MAX_CALLS = 30;
const CALL_TIMEOUT_MS = 8_000;

// Offset of the last page seen, kept per server instance. Warm instances
// usually find the tail in 1–2 calls instead of re-walking from the guess.
let tailOffsetHint = null;

async function fetchPage(offset) {
  const key = process.env.CRM_API_KEY;
  if (!key) throw new Error('CRM_API_KEY is not set');
  const base = process.env.CRM_API_BASE || DEFAULT_BASE;
  const url = `${base}/api/v1/oh/crm/all-visits/?limit=${PAGE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { 'X-CRM-Key': key },
    cache: 'no-store',
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CRM all-visits ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  return { visits: Array.isArray(j.visits) ? j.visits : [], pagination: j.pagination || {} };
}

// Binary-search the last non-empty offset. Only used when there is no hint
// at all (sheet read failed on a cold instance) — ~18 calls.
async function findLastOffset(get) {
  let lo = 0;
  let hi = 1 << 18;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const p = await get(mid);
    if (p.visits.length > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Returns every CRM visit with id > sinceId (all of the tail when sinceId is
// null), normalized to the sheet's snake_case field names.
//   sinceId     — highest visit id already present in the sheet
//   offsetGuess — where to start looking for the tail (sheet row count)
export async function fetchCrmVisitsAfter({ sinceId = null, offsetGuess = null } = {}) {
  let calls = 0;
  const get = (offset) => {
    if (++calls > MAX_CALLS) throw new Error('CRM visit lookup exceeded its call budget');
    return fetchPage(offset);
  };

  let offset = tailOffsetHint ?? offsetGuess;
  if (offset == null) offset = Math.max(0, (await findLastOffset(get)) - PAGE + 1);
  offset = Math.max(0, offset);

  let page = await get(offset);
  // Guess landed past the end (rows deleted, or sheet has more rows than the
  // CRM). Back off exponentially until we hit data.
  let step = PAGE;
  let emptyAt = null;
  while (page.visits.length === 0 && offset > 0) {
    emptyAt = offset;
    offset = Math.max(0, offset - step);
    step *= 2;
    page = await get(offset);
  }
  // The back-off can overshoot by thousands of rows; bisect the gap so the
  // forward walk below is a page or two, not dozens.
  if (emptyAt != null && page.visits.length > 0) {
    let hi = emptyAt;
    while (hi - offset > PAGE) {
      const mid = (offset + hi) >> 1;
      const p = await get(mid);
      if (p.visits.length > 0) {
        offset = mid;
        page = p;
      } else {
        hi = mid;
      }
    }
  }

  let firstOffset = offset;
  const rows = [...page.visits];
  while (page.pagination.hasMore && page.pagination.nextOffset != null) {
    offset = page.pagination.nextOffset;
    page = await get(offset);
    rows.push(...page.visits);
  }
  tailOffsetHint = offset;

  // Walk backwards until the window reaches the sheet's last id, so nothing
  // created between the sheet snapshot and our start offset is skipped.
  const minId = () => rows.reduce((m, v) => Math.min(m, Number(v.id)), Infinity);
  while (sinceId != null && firstOffset > 0 && minId() > sinceId) {
    firstOffset = Math.max(0, firstOffset - PAGE);
    const p = await get(firstOffset);
    rows.unshift(...p.visits);
  }

  const seen = new Set();
  const out = [];
  for (const v of rows) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    if (sinceId != null && Number(v.id) <= sinceId) continue;
    out.push(normalizeCrmVisit(v));
  }
  return out;
}

const str = (v) => (v == null || v === '' ? null : String(v).trim() || null);

// camelCase CRM row → the snake_case shape the sheet reader returns, so the
// picker and cp_visit_meta don't care which source a visit came from.
export function normalizeCrmVisit(v) {
  return {
    id: str(v.id),
    selected_date: str(v.selectedDate),
    selected_time: str(v.selectedTime),
    status: str(v.status),
    lead_status: str(v.leadStatus),
    broker_name: str(v.brokerName),
    broker_contact: str(v.brokerContact),
    broker_alt_contact: str(v.brokerAltContact),
    cp_code: str(v.cpCode),
    company_name: str(v.companyName),
    city: str(v.city),
    buyer_name: str(v.buyerName),
    buyer_contact: str(v.buyerContact),
    profession: str(v.profession),
    society_name: str(v.societyName),
    unit_address_line1: str(v.unitAddressLine1),
    unit_address_line2: str(v.unitAddressLine2),
  };
}
