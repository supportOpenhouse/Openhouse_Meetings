'use client';

import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { VisitRow } from '@/app/sales/client';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'follow_up_required', label: 'Follow-ups' },
  { key: 'onboarded', label: 'Onboarded' },
  { key: 'processing', label: 'Processing' },
];

// Groups visits under a human date heading (Today / Yesterday / date).
// Absolute IST date heading — deterministic given the timestamp, so SSR and the
// client render identically (no hydration mismatch). Relative "Today/Yesterday"
// is intentionally avoided here because it depends on the render moment.
function dayHeading(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function SalesReportsClient({ initialVisits }) {
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return initialVisits;
    if (filter === 'processing') return initialVisits.filter((v) => v.status === 'processing');
    return initialVisits.filter((v) => v.meeting_outcome === filter);
  }, [filter, initialVisits]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const v of filtered) {
      const key = dayHeading(v.check_in_time);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(v);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div>
      <h1 className="oh-h1">
        Your <em>visits</em>
      </h1>
      <p className="oh-sub" style={{ marginBottom: 16 }}>
        {initialVisits.length} {initialVisits.length === 1 ? 'visit' : 'visits'} logged.
      </p>

      <div className="sx-chips" style={{ marginBottom: 18 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`sx-chip ${filter === f.key ? 'on' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="sx-empty">
          <div className="ico">
            <BarChart3 size={22} />
          </div>
          <div className="t">No visits</div>
          <div className="s">Nothing matches this filter yet.</div>
        </div>
      ) : (
        groups.map(([heading, items]) => (
          <section key={heading} style={{ marginBottom: 22 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--ink-3)',
                fontWeight: 500,
                marginBottom: 8,
              }}
            >
              {heading}
            </div>
            <div className="sx-list">
              {items.map((v) => (
                <VisitRow key={v.id} v={v} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
