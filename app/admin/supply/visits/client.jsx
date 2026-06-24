'use client';

import { useMemo, useState } from 'react';
import { Footprints } from 'lucide-react';
import { AdminSalesTabs, AdminVisitRow } from '@/components/SalesAdmin';

const STATUS = [
  { key: 'all', label: 'All' },
  { key: 'ready', label: 'Ready' },
  { key: 'processing', label: 'Processing' },
  { key: 'failed', label: 'Failed' },
];
const OUTCOME = [
  { key: 'all', label: 'Any outcome' },
  { key: 'onboarded', label: 'Onboarded' },
  { key: 'follow_up_required', label: 'Follow-up' },
  { key: 'future_potential', label: 'Future' },
  { key: 'not_interested', label: 'Not interested' },
];

export default function AdminSalesVisitsClient({ initialVisits, reps }) {
  const [rep, setRep] = useState('all');
  const [status, setStatus] = useState('all');
  const [outcome, setOutcome] = useState('all');

  const filtered = useMemo(() => {
    return initialVisits.filter((v) => {
      if (rep !== 'all' && v.sales_rm_id !== rep) return false;
      if (status !== 'all' && v.status !== status) return false;
      if (outcome !== 'all' && v.meeting_outcome !== outcome) return false;
      return true;
    });
  }, [initialVisits, rep, status, outcome]);

  return (
    <div className="oh-sales">
      <AdminSalesTabs current="visits" />

      <h1 className="oh-h1" style={{ fontSize: 36 }}>
        All <em>visits</em>
      </h1>
      <p className="oh-sub">
        {filtered.length} of {initialVisits.length} visits
      </p>

      <div className="sx-filters">
        <select className="oh-select" value={rep} onChange={(e) => setRep(e.target.value)}>
          <option value="all">All reps</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name || r.email}
            </option>
          ))}
        </select>
        <div className="sx-chips">
          {STATUS.map((s) => (
            <button
              key={s.key}
              className={`sx-chip ${status === s.key ? 'on' : ''}`}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sx-chips" style={{ marginBottom: 18 }}>
        {OUTCOME.map((o) => (
          <button
            key={o.key}
            className={`sx-chip ${outcome === o.key ? 'on' : ''}`}
            onClick={() => setOutcome(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="sx-empty">
          <div className="ico">
            <Footprints size={22} />
          </div>
          <div className="t">No visits match</div>
          <div className="s">Try a different filter.</div>
        </div>
      ) : (
        <div className="sx-list">
          {filtered.map((v) => (
            <AdminVisitRow key={v.id} v={v} />
          ))}
        </div>
      )}

      <style jsx>{`
        .sx-filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .sx-filters select {
          min-width: 180px;
        }
        @media (max-width: 768px) {
          .sx-filters select {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
