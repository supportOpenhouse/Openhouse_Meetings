'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  CalendarCheck,
  TrendingUp,
  BarChart3,
  Users,
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  fmtTime,
  fmtDuration,
  followupLabel,
  isOverdue,
  initials,
  OUTCOME_LABELS,
  OUTCOME_PILL,
  ENGAGEMENT_LABELS,
} from '@/lib/salesFormat';

function greeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function SalesDashboardClient({ initialData, user }) {
  const { stats, today, followups } = initialData;
  const firstName = (user.name || user.email || '').split(' ')[0].split('@')[0];

  // Compute the time-of-day greeting only after mount to avoid a server/client
  // timezone hydration mismatch (server runs UTC).
  const [hello, setHello] = useState('Welcome back');
  useEffect(() => {
    setHello(greeting(new Date().getHours()));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="sx-hero">
        <div className="eyebrow">Field Sales</div>
        <h1>
          {hello}
          {firstName ? (
            <>
              , <em>{firstName}</em>
            </>
          ) : null}
        </h1>
        <p className="sub">
          {stats.today > 0
            ? `${stats.today} ${stats.today === 1 ? 'visit' : 'visits'} logged today — keep the momentum going.`
            : 'No visits logged yet today. Ready when you are.'}
        </p>
        <Link href="/sales/visits/new" className="sx-hero-cta">
          <Plus size={18} /> Log a visit
        </Link>
      </section>

      {/* Stats */}
      <div className="sx-stats" style={{ marginTop: 20 }}>
        <div className="sx-stat">
          <div className="ico">
            <CalendarCheck size={17} />
          </div>
          <div className="v">{stats.today}</div>
          <div className="l">Today</div>
        </div>
        <div className="sx-stat">
          <div className="ico amber">
            <TrendingUp size={17} />
          </div>
          <div className="v">{stats.week}</div>
          <div className="l">This week</div>
        </div>
        <div className="sx-stat">
          <div className="ico">
            <BarChart3 size={17} />
          </div>
          <div className="v">{stats.total}</div>
          <div className="l">All visits</div>
        </div>
        <div className="sx-stat">
          <div className="ico green">
            <Users size={17} />
          </div>
          <div className="v">{stats.cps}</div>
          <div className="l">Partners</div>
        </div>
      </div>

      {/* Follow-ups due */}
      {followups.length > 0 && (
        <section className="sx-section">
          <div className="sx-section-head">
            <h2>Follow-ups due</h2>
          </div>
          <div className="sx-list">
            {followups.map((f) => {
              const overdue = isOverdue(f.next_followup_date);
              return (
                <Link
                  key={f.id}
                  href={f.sales_cp_id ? `/sales/cps/${f.sales_cp_id}` : `/sales/visits/${f.id}`}
                  className="sx-row"
                >
                  <div
                    className="avatar"
                    style={
                      overdue
                        ? { background: 'var(--danger-soft)', color: 'var(--danger)' }
                        : undefined
                    }
                  >
                    {overdue ? <AlertCircle size={18} /> : initials(f.cp_name)}
                  </div>
                  <div className="body">
                    <div className="title">{f.cp_name || 'Channel partner'}</div>
                    <div className="meta">
                      {f.cp_code && <span className="code">{f.cp_code}</span>}
                      {f.next_action_required && <span>{f.next_action_required}</span>}
                    </div>
                  </div>
                  <span className={`sx-pill ${overdue ? 'not_interested' : 'follow_up'}`}>
                    {followupLabel(f.next_followup_date)}
                  </span>
                  <span className="chev">
                    <ChevronRight size={18} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Today's visits */}
      <section className="sx-section">
        <div className="sx-section-head">
          <h2>Today’s visits</h2>
          <Link href="/sales/reports">All visits →</Link>
        </div>
        {today.length === 0 ? (
          <div className="sx-empty">
            <div className="ico">
              <CheckCircle2 size={22} />
            </div>
            <div className="t">Nothing logged yet</div>
            <div className="s">Your visits for today will show up here.</div>
          </div>
        ) : (
          <div className="sx-list">
            {today.map((v) => (
              <VisitRow key={v.id} v={v} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function VisitRow({ v }) {
  const outcomeClass = OUTCOME_PILL[v.meeting_outcome];
  return (
    <Link href={`/sales/visits/${v.id}`} className="sx-row">
      <div className="avatar">{initials(v.cp_name)}</div>
      <div className="body">
        <div className="title">{v.cp_name || 'Channel partner'}</div>
        <div className="meta">
          {v.cp_code && <span className="code">{v.cp_code}</span>}
          <span>
            <Clock size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />
            {fmtTime(v.check_in_time)}
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
