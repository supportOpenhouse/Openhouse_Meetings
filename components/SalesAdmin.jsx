'use client';

import Link from 'next/link';
import { ChevronRight, Clock, Users } from 'lucide-react';
import {
  fmtTime,
  fmtDate,
  fmtDuration,
  initials,
  ENGAGEMENT_LABELS,
  OUTCOME_LABELS,
  OUTCOME_PILL,
} from '@/lib/salesFormat';

// Shared building blocks for the admin "Field sales" oversight pages. These
// render inside a .oh-sales wrapper (see each page client) so the teal sx-*
// components apply — giving the admin sales section the product's identity.

const TABS = [
  { href: '/admin/sales', key: 'overview', label: 'Overview' },
  { href: '/admin/sales/reps', key: 'reps', label: 'Reps' },
  { href: '/admin/sales/visits', key: 'visits', label: 'Visits' },
  { href: '/admin/sales/cps', key: 'cps', label: 'Partners' },
];

export function AdminSalesTabs({ current }) {
  return (
    <div className="sx-chips" style={{ marginBottom: 20 }}>
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} className={`sx-chip ${current === t.key ? 'on' : ''}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function StatTile({ icon, tone, value, label }) {
  return (
    <div className="sx-stat">
      <div className={`ico ${tone || ''}`}>{icon}</div>
      <div className="v">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

// A visit row for admin lists — like the rep VisitRow but surfaces the rep who
// logged it. Links into the canonical visit detail (admins are authorized).
export function AdminVisitRow({ v }) {
  const outcomeClass = OUTCOME_PILL[v.meeting_outcome];
  return (
    <Link href={`/sales/visits/${v.id}`} className="sx-row">
      <div className="avatar">{initials(v.cp_name)}</div>
      <div className="body">
        <div className="title">{v.cp_name || 'Channel partner'}</div>
        <div className="meta">
          {v.rm_name && <span>{v.rm_name}</span>}
          {v.cp_code && <span className="code">{v.cp_code}</span>}
          <span>
            <Clock size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />
            {fmtDate(v.check_in_time)} {fmtTime(v.check_in_time)}
          </span>
          {v.duration_seconds > 0 && <span>{fmtDuration(v.duration_seconds)}</span>}
        </div>
      </div>
      {v.status === 'processing' ? (
        <span className="sx-pill processing">Processing</span>
      ) : v.status === 'failed' ? (
        <span className="sx-pill failed">Failed</span>
      ) : outcomeClass ? (
        <span className={`sx-pill ${outcomeClass}`}>{OUTCOME_LABELS[v.meeting_outcome]}</span>
      ) : v.cp_engagement_level ? (
        <span className={`sx-pill ${v.cp_engagement_level}`}>
          {ENGAGEMENT_LABELS[v.cp_engagement_level]}
        </span>
      ) : null}
      <span className="chev">
        <ChevronRight size={18} />
      </span>
    </Link>
  );
}

// Per-rep performance card for the reps page.
export function RepCard({ rep }) {
  return (
    <div className="sx-rep-card">
      <div className="avatar">{initials(rep.name || rep.email)}</div>
      <div className="who">
        <div className="nm">
          {rep.name || rep.email}
          {!rep.is_active && <span className="sx-pill not_interested">Inactive</span>}
        </div>
        <div className="em">{rep.email}</div>
      </div>
      <div className="nums">
        <div className="n">
          <strong>{rep.visit_count || 0}</strong>
          <span>visits</span>
        </div>
        <div className="n">
          <strong>{rep.onboarded_count || 0}</strong>
          <span>onboarded</span>
        </div>
        <div className="n">
          <strong>{rep.cps_registered || 0}</strong>
          <span>partners</span>
        </div>
        <div className="n">
          <strong>{rep.last_visit_at ? fmtDate(rep.last_visit_at) : '—'}</strong>
          <span>last visit</span>
        </div>
      </div>

      <style jsx>{`
        .sx-rep-card {
          display: flex;
          align-items: center;
          gap: 14px;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px 18px;
          flex-wrap: wrap;
        }
        .sx-rep-card .avatar {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sans); font-weight: 700;
          font-size: 20px;
          color: var(--accent);
          background: var(--accent-soft);
          flex-shrink: 0;
        }
        .sx-rep-card .who {
          flex: 1;
          min-width: 140px;
        }
        .sx-rep-card .nm {
          font-weight: 500;
          color: var(--ink);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sx-rep-card .em {
          font-size: 12px;
          color: var(--ink-3);
        }
        .sx-rep-card .nums {
          display: flex;
          gap: 22px;
        }
        .sx-rep-card .n {
          display: flex;
          flex-direction: column;
        }
        .sx-rep-card .n strong {
          font-family: var(--font-sans); font-weight: 700;
          font-size: 22px;
          font-weight: 400;
          color: var(--ink);
          line-height: 1;
        }
        .sx-rep-card .n span {
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--ink-3);
          margin-top: 3px;
        }
        @media (max-width: 768px) {
          .sx-rep-card .nums {
            gap: 16px;
            width: 100%;
          }
          .sx-rep-card .n strong {
            font-size: 19px;
          }
        }
      `}</style>
    </div>
  );
}
