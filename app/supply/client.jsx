'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  ChevronRight,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Users,
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
import QuickStats from '@/components/supply/QuickStats';
import DailyTargets from '@/components/supply/DailyTargets';
import RecentPartners from '@/components/supply/RecentPartners';

function greeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function SalesDashboardClient({ initialData, user }) {
  const { stats, today, followups, targets, recentCps } = initialData;
  const firstName = (user.name || user.email || '').split(' ')[0].split('@')[0];

  // Greeting + date are computed only after mount to avoid a server/client
  // timezone hydration mismatch (the server runs UTC).
  const [hello, setHello] = useState('Welcome back');
  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => {
    const now = new Date();
    setHello(greeting(now.getHours()));
    setTodayLabel(
      now.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    );
  }, []);

  const overdueCount = followups.filter((f) => isOverdue(f.next_followup_date)).length;

  return (
    <div>
      {/* 1 — Greeting hero */}
      <section className="sx-hero">
        <div className="eyebrow">Supply{todayLabel ? ` · ${todayLabel}` : ''}</div>
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
        <Link href="/supply/visits/new" className="sx-hero-cta">
          <Plus size={18} /> Log a visit
        </Link>
      </section>

      {/* 2 — Quick stats */}
      <QuickStats stats={stats} />

      {/* 3 — Daily targets */}
      <div style={{ marginTop: 20 }}>
        <DailyTargets targets={targets} />
      </div>

      {/* 4 — Overdue follow-ups banner */}
      {overdueCount > 0 && (
        <a href="#followups" className="hm-overdue">
          <span className="hm-overdue-ico">
            <AlertTriangle size={18} />
          </span>
          <span className="hm-overdue-body">
            <span className="hm-overdue-title">
              {overdueCount} overdue follow-{overdueCount === 1 ? 'up' : 'ups'}
            </span>
            <span className="hm-overdue-sub">Tap to review the partners waiting on you.</span>
          </span>
          <ChevronRight size={18} className="hm-overdue-chev" />
        </a>
      )}

      {/* 5 — Follow-ups due */}
      {followups.length > 0 && (
        <section className="sx-section" id="followups">
          <div className="sx-section-head">
            <h2>Follow-ups due</h2>
          </div>
          <div className="sx-list">
            {followups.map((f) => {
              const overdue = isOverdue(f.next_followup_date);
              return (
                <Link
                  key={f.id}
                  href={f.sales_cp_id ? `/supply/cps/${f.sales_cp_id}` : `/supply/visits/${f.id}`}
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

      {/* 6 — Today's visits */}
      <section className="sx-section">
        <div className="sx-section-head">
          <h2>Today’s visits</h2>
          <Link href="/supply/reports">All visits →</Link>
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

      {/* 7 — Recent partners */}
      <section className="sx-section">
        <div className="sx-section-head">
          <h2>Recent partners</h2>
          <Link href="/supply/cps">All partners →</Link>
        </div>
        {recentCps && recentCps.length > 0 ? (
          <RecentPartners cps={recentCps} />
        ) : (
          <div className="sx-empty">
            <div className="ico">
              <Users size={22} />
            </div>
            <div className="t">No partners yet</div>
            <div className="s">Register your first channel partner to get started.</div>
          </div>
        )}
      </section>

      <style jsx>{`
        .hm-overdue {
          all: unset;
          cursor: pointer;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 20px;
          padding: 14px 16px;
          border-radius: 14px;
          background: var(--danger-soft);
          border: 1px solid rgba(229, 62, 62, 0.28);
          transition: filter 0.15s;
        }
        .hm-overdue:hover {
          filter: brightness(0.99);
        }
        .hm-overdue-ico {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--danger);
          color: #fff;
        }
        .hm-overdue-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .hm-overdue-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--danger);
        }
        .hm-overdue-sub {
          font-size: 12px;
          color: #9a3b3b;
          margin-top: 1px;
        }
        .hm-overdue :global(.hm-overdue-chev) {
          flex-shrink: 0;
          color: var(--danger);
        }
      `}</style>
    </div>
  );
}

export function VisitRow({ v }) {
  const outcomeClass = OUTCOME_PILL[v.meeting_outcome];
  return (
    <Link href={`/supply/visits/${v.id}`} className="sx-row">
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
