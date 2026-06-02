// Collapses a list of meetings so meetings sharing the given key appear as a
// single row in the dashboard. Each returned entry is either:
//   - a single meeting (unchanged), OR
//   - the most-recent meeting of a thread, with `_threadItems` set to ALL
//     meetings in the thread (newest first). Components can detect the
//     thread via `m._threadItems.length > 1` and open MeetingThreadDetail
//     instead of MeetingDetail.
//
// Used for two cases today:
//   - key='cp_visit_id' — visits originating from the same scheduled-visit
//     row in the Google Sheet (one buyer at one society, many recordings).
//   - key='cp_mobile'   — direct-RM phone calls to the same buyer.

export function collapseThreadsByKey(meetings, key) {
  if (!Array.isArray(meetings) || meetings.length === 0) return [];
  if (!key) return meetings.slice();

  const buckets = new Map();
  const solos = [];

  for (const m of meetings) {
    const raw = m[key];
    if (raw && String(raw).trim()) {
      if (!buckets.has(raw)) buckets.set(raw, []);
      buckets.get(raw).push(m);
    } else {
      solos.push(m);
    }
  }

  const collapsed = solos.slice();
  for (const [, items] of buckets) {
    items.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    if (items.length === 1) {
      collapsed.push(items[0]);
    } else {
      // Most-recent as the lead — the row reflects the latest state. Total
      // duration sums across recordings ("X minutes recorded on this visit"
      // / "Y minutes called this buyer").
      const lead = items[0];
      const totalDur = items.reduce((sum, it) => sum + (it.duration_seconds || 0), 0);
      collapsed.push({
        ...lead,
        duration_seconds: totalDur,
        _threadItems: items,
      });
    }
  }

  collapsed.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  return collapsed;
}

// Backwards-compatible alias for callers already importing the visit-only name.
export function collapseVisitThreads(meetings) {
  return collapseThreadsByKey(meetings, 'cp_visit_id');
}
