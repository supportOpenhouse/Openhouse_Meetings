'use client';

import { useEffect, useState } from 'react';
import {
  Footprints, Briefcase, Handshake, MessageSquareWarning, Sparkles, Loader2, Send, Package, Users, X,
} from 'lucide-react';
import { fmtDate } from '@/lib/utils';
import DownloadCsv from '@/components/insights/DownloadCsv';

const PERIODS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 0, label: 'All time' },
];

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);
const initials = (name) => (String(name || '?').trim().charAt(0) || '?').toUpperCase();
const slug = (s) => (s || 'visits').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'visits';

export default function SupplyInsightsClient({ initial }) {
  const [period, setPeriod] = useState(90);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('visits');
  const [drill, setDrill] = useState(null); // { title, jsonUrl, csvUrl }

  async function changePeriod(p) {
    if (p === period) return;
    setPeriod(p);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/supply/insights?period=${p}`);
      if (res.ok) setData(await res.json());
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }

  // Records URL helpers — `period` is passed (stable) and the server derives the
  // since-date, so the CSV href doesn't depend on Date.now() at render time.
  function recordsQs(selector) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(selector || {})) {
      if (v !== null && v !== undefined && v !== '') qs.set(k, String(v));
    }
    if (period > 0 && !selector?.ids) qs.set('period', String(period));
    return qs.toString();
  }
  function exportHref(selector, name) {
    const qs = new URLSearchParams(recordsQs(selector));
    qs.set('format', 'csv');
    if (name) qs.set('name', name);
    return `/api/admin/supply/insights/records?${qs.toString()}`;
  }
  function onDrill(title, selector, name) {
    setDrill({
      title,
      jsonUrl: `/api/admin/supply/insights/records?${recordsQs(selector)}`,
      csvUrl: exportHref(selector, name),
    });
  }
  const helpers = { exportHref, onDrill };

  const m = data.agg || {};

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 className="oh-h1">
          Supply <em>insights</em>
        </h1>
        <p className="oh-sub" style={{ margin: 0 }}>
          Field-visit analytics across the supply team.
        </p>
      </div>

      <div className="si-periods">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`si-period ${period === p.value ? 'active' : ''}`}
            onClick={() => changePeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
        {loading && <Loader2 size={14} className="oh-spin" style={{ color: 'var(--ink-3)' }} />}
      </div>

      <div className="si-tabs">
        <Tab active={tab === 'visits'} onClick={() => setTab('visits')} icon={Footprints} label="Visits" />
        <Tab active={tab === 'engagement'} onClick={() => setTab('engagement')} icon={Briefcase} label="Engagement" />
        <Tab active={tab === 'onboarding'} onClick={() => setTab('onboarding')} icon={Handshake} label="Onboarding" />
        <Tab active={tab === 'themes'} onClick={() => setTab('themes')} icon={MessageSquareWarning} label="Themes" />
        <Tab active={tab === 'ask'} onClick={() => setTab('ask')} icon={Sparkles} label="Ask anything" />
      </div>

      {tab !== 'ask' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 -8px' }}>
          <DownloadCsv
            variant="button"
            label="Export this tab"
            title="Download every visit in scope (current period)"
            href={exportHref({}, `supply-${tab}`)}
          />
        </div>
      )}

      <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
        {tab === 'visits' && <VisitsTab m={m} data={data} x={helpers} />}
        {tab === 'engagement' && <EngagementTab m={m} x={helpers} />}
        {tab === 'onboarding' && <OnboardingTab m={m} x={helpers} />}
        {tab === 'themes' && <ThemesTab themes={data.themes || {}} x={helpers} />}
        {tab === 'ask' && <AskTab period={period} x={helpers} />}
      </div>

      {drill && <VisitsModal drill={drill} onClose={() => setDrill(null)} />}

      <style jsx>{`
        .si-periods { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }
        .si-period {
          all: unset; cursor: pointer; font-size: 12.5px; padding: 6px 13px; border-radius: 999px;
          border: 1px solid var(--border); color: var(--ink-2);
        }
        .si-period.active { background: var(--accent); color: #fff; border-color: var(--accent); }
        .si-tabs {
          display: flex; gap: 4px; border-bottom: 1px solid var(--border);
          margin: 16px 0 22px; overflow-x: auto;
        }
      `}</style>
    </div>
  );
}

function Tab({ active, onClick, icon: Icon, label }) {
  return (
    <button type="button" onClick={onClick} className={`si-tab ${active ? 'active' : ''}`}>
      <Icon size={13} /> {label}
      <style jsx>{`
        .si-tab {
          all: unset; cursor: pointer; display: flex; align-items: center; gap: 6px;
          padding: 10px 14px; font-size: 13.5px; color: var(--ink-2);
          border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap;
        }
        .si-tab.active { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
      `}</style>
    </button>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────
function Stat({ label, value, sub }) {
  return (
    <div className="si-stat">
      <div className="v">{value}</div>
      <div className="l">{label}</div>
      {sub != null && <div className="s">{sub}</div>}
      <style jsx>{`
        .si-stat {
          background: var(--grad-card); border: 1px solid var(--border); border-radius: 16px;
          padding: 16px 18px; box-shadow: var(--shadow-md);
        }
        .v { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); line-height: 1; }
        .l { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); margin-top: 8px; font-weight: 600; }
        .s { font-size: 12px; color: var(--ink-2); margin-top: 3px; }
      `}</style>
    </div>
  );
}

function StatGrid({ children }) {
  return (
    <div className="si-grid">
      {children}
      <style jsx>{`
        .si-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      `}</style>
    </div>
  );
}

function Section({ title, sub, action, children }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div className="si-sec-head">
        <span className="si-sec-title">
          {title}
          {sub && <span className="si-sec-sub">{sub}</span>}
        </span>
        {action || null}
      </div>
      {children}
      <style jsx>{`
        .si-sec-head {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 12px;
        }
        .si-sec-title { display: inline-flex; align-items: baseline; gap: 8px; min-width: 0; }
        .si-sec-sub { font-size: 12px; font-weight: 500; color: var(--ink-3); }
      `}</style>
    </div>
  );
}

// A horizontal bar row. When `onClick` is set the row is a drill-down trigger.
function BarRow({ label, n, total, tone = 'accent', onClick }) {
  const p = pct(n, total);
  const clickable = !!onClick;
  return (
    <div
      className={`si-bar ${clickable ? 'clickable' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="top">
        <span className="lbl">{label}</span>
        <span className="cnt">
          {n} <em>· {p}%</em>{clickable && <span className="go"> ›</span>}
        </span>
      </div>
      <div className="track">
        <div className={`fill ${tone}`} style={{ width: `${p}%` }} />
      </div>
      <style jsx>{`
        .si-bar { margin-bottom: 12px; border-radius: 8px; }
        .si-bar.clickable { cursor: pointer; padding: 4px 6px; margin: -4px -6px 8px; }
        .si-bar.clickable:hover { background: var(--paper-2); }
        .top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
        .lbl { font-size: 13.5px; color: var(--ink); font-weight: 500; }
        .cnt { font-size: 13px; color: var(--ink); font-weight: 600; }
        .cnt em { font-style: normal; color: var(--ink-3); font-weight: 500; }
        .cnt .go { color: var(--accent); }
        .track { height: 9px; background: var(--paper-2); border-radius: 100px; overflow: hidden; }
        .fill { height: 100%; border-radius: 100px; }
        .fill.accent { background: var(--grad-primary); }
        .fill.amber { background: var(--grad-accent); }
        .fill.green { background: var(--success); }
        .fill.red { background: var(--danger); }
        .fill.grey { background: var(--ink-3); }
      `}</style>
    </div>
  );
}

function Card({ children }) {
  return (
    <div className="si-card">
      {children}
      <style jsx>{`
        .si-card {
          background: var(--paper); border: 1px solid var(--border); border-radius: 16px;
          padding: 20px; box-shadow: var(--shadow-md);
        }
      `}</style>
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '8px 0' }}>{text}</div>;
}

// A small ⤓ for a Section header.
function SectionCsv({ x, selector, name, title }) {
  return <DownloadCsv href={x.exportHref(selector, name)} title={title || 'Download these records (current period)'} />;
}

// ── tabs ──────────────────────────────────────────────────────────────────
function VisitsTab({ m, data, x }) {
  const total = m.total || 0;
  const weeks = data.volumeByWeek || [];
  const maxWeek = Math.max(1, ...weeks.map((w) => w.n));
  return (
    <div>
      <StatGrid>
        <Stat label="Visits" value={total} sub={`${m.partners || 0} partners`} />
        <Stat label="Onboarded" value={m.onboarded || 0} sub={`${pct(m.onboarded, total)}% of visits`} />
        <Stat label="Inventory shared" value={m.inventory_received || 0} sub={`${m.inventory_units || 0} units`} />
        <Stat label="Active reps" value={m.active_reps || 0} />
        <Stat label="Avg visit" value={m.avg_duration ? `${Math.round(m.avg_duration / 60)}m` : '—'} />
      </StatGrid>

      <Section title="Outcomes" action={<SectionCsv x={x} selector={{}} name="supply-outcomes" />}>
        <Card>
          {total === 0 ? (
            <Empty text="No ready visits in this period yet." />
          ) : (
            <>
              <BarRow label="Onboarded" n={m.onboarded || 0} total={total} tone="green" onClick={() => x.onDrill('Onboarded visits', { outcome: 'onboarded' }, 'onboarded')} />
              <BarRow label="Follow-up required" n={m.follow_up || 0} total={total} tone="amber" onClick={() => x.onDrill('Follow-up required', { outcome: 'follow_up_required' }, 'follow-up')} />
              <BarRow label="Future potential" n={m.future_potential || 0} total={total} tone="accent" onClick={() => x.onDrill('Future potential', { outcome: 'future_potential' }, 'future-potential')} />
              <BarRow label="Not interested" n={m.not_interested || 0} total={total} tone="red" onClick={() => x.onDrill('Not interested', { outcome: 'not_interested' }, 'not-interested')} />
            </>
          )}
        </Card>
      </Section>

      <Section title="First vs repeat" action={<SectionCsv x={x} selector={{}} name="supply-first-repeat" />}>
        <Card>
          <BarRow label="First visit" n={m.first_visits || 0} total={total} tone="accent" onClick={() => x.onDrill('First visits', { meeting_type: 'first_visit' }, 'first-visit')} />
          <BarRow label="Repeat visit" n={m.repeat_visits || 0} total={total} tone="amber" onClick={() => x.onDrill('Repeat visits', { meeting_type: 'repeat_visit' }, 'repeat-visit')} />
        </Card>
      </Section>

      <Section title="Visits per week" action={<SectionCsv x={x} selector={{}} name="supply-weekly" />}>
        <Card>
          {weeks.length === 0 ? (
            <Empty text="No visit history yet." />
          ) : (
            <div className="si-chart">
              {weeks.map((w) => (
                <div key={w.week} className="col">
                  <div className="bar" style={{ height: `${Math.max(6, (w.n / maxWeek) * 120)}px` }}>
                    <span>{w.n}</span>
                  </div>
                  <div className="wk">{w.week.slice(5)}</div>
                </div>
              ))}
              <style jsx>{`
                .si-chart { display: flex; align-items: flex-end; gap: 10px; min-height: 150px; overflow-x: auto; padding-top: 18px; }
                .col { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 34px; }
                .bar {
                  width: 26px; background: var(--grad-accent); border-radius: 8px 8px 4px 4px;
                  position: relative; display: flex; justify-content: center;
                }
                .bar span { position: absolute; top: -16px; font-size: 11px; font-weight: 700; color: var(--ink); }
                .wk { font-size: 10px; color: var(--ink-3); }
              `}</style>
            </div>
          )}
        </Card>
      </Section>

      <Leaderboard rows={data.leaderboard || []} x={x} />
    </div>
  );
}

function EngagementTab({ m, x }) {
  const total = m.total || 0;
  return (
    <div>
      <Section title="CP sentiment" sub="AI-read from each visit" action={<SectionCsv x={x} selector={{}} name="supply-sentiment" />}>
        <Card>
          {total === 0 ? (
            <Empty text="No data yet." />
          ) : (
            <>
              <BarRow label="Positive" n={m.sent_positive || 0} total={total} tone="green" onClick={() => x.onDrill('Positive sentiment', { sentiment: 'positive' }, 'sentiment-positive')} />
              <BarRow label="Neutral" n={m.sent_neutral || 0} total={total} tone="grey" onClick={() => x.onDrill('Neutral sentiment', { sentiment: 'neutral' }, 'sentiment-neutral')} />
              <BarRow label="Disengaged" n={m.sent_disengaged || 0} total={total} tone="red" onClick={() => x.onDrill('Disengaged sentiment', { sentiment: 'disengaged' }, 'sentiment-disengaged')} />
            </>
          )}
        </Card>
      </Section>
      <Section title="Rep-logged engagement" action={<SectionCsv x={x} selector={{}} name="supply-engagement" />}>
        <Card>
          <BarRow label="Positive" n={m.eng_positive || 0} total={total} tone="green" onClick={() => x.onDrill('Engagement: positive', { engagement: 'positive' }, 'engagement-positive')} />
          <BarRow label="Neutral" n={m.eng_neutral || 0} total={total} tone="grey" onClick={() => x.onDrill('Engagement: neutral', { engagement: 'neutral' }, 'engagement-neutral')} />
          <BarRow label="Disengaged" n={m.eng_disengaged || 0} total={total} tone="red" onClick={() => x.onDrill('Engagement: disengaged', { engagement: 'disengaged' }, 'engagement-disengaged')} />
        </Card>
      </Section>
    </div>
  );
}

function OnboardingTab({ m, x }) {
  const total = m.total || 0;
  const conv = pct(m.stage_onboarded || 0, total);
  return (
    <div>
      <StatGrid>
        <Stat label="Onboarded" value={m.stage_onboarded || 0} sub={`${conv}% of visits`} />
        <Stat label="Ready to onboard" value={m.stage_ready || 0} />
        <Stat label="Evaluating" value={m.stage_evaluating || 0} />
        <Stat label="Not interested" value={m.stage_not_interested || 0} />
      </StatGrid>
      <Section title="Onboarding stage" sub="journey position" action={<SectionCsv x={x} selector={{}} name="supply-onboarding-stage" />}>
        <Card>
          {total === 0 ? (
            <Empty text="No data yet." />
          ) : (
            <>
              <BarRow label="Onboarded" n={m.stage_onboarded || 0} total={total} tone="green" onClick={() => x.onDrill('Stage: onboarded', { stage: 'onboarded' }, 'stage-onboarded')} />
              <BarRow label="Ready to onboard" n={m.stage_ready || 0} total={total} tone="accent" onClick={() => x.onDrill('Stage: ready to onboard', { stage: 'ready_to_onboard' }, 'stage-ready')} />
              <BarRow label="Evaluating" n={m.stage_evaluating || 0} total={total} tone="amber" onClick={() => x.onDrill('Stage: evaluating', { stage: 'evaluating' }, 'stage-evaluating')} />
              <BarRow label="Not interested" n={m.stage_not_interested || 0} total={total} tone="red" onClick={() => x.onDrill('Stage: not interested', { stage: 'not_interested' }, 'stage-not-interested')} />
            </>
          )}
        </Card>
      </Section>
    </div>
  );
}

function ThemeList({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <Section title={title}>
      <Card>
        {rows.length === 0 ? (
          <Empty text="Nothing surfaced in this period." />
        ) : (
          rows.map((r) => <BarRow key={r.label} label={r.label} n={r.n} total={max} tone="accent" />)
        )}
      </Card>
    </Section>
  );
}

function ThemesTab({ themes }) {
  return (
    <div>
      <p className="oh-sub" style={{ marginTop: 0 }}>
        The most common items the AI pulled from visit summaries. Use “Ask anything” for clustered,
        cited analysis across transcripts (with its own CSV export).
      </p>
      <ThemeList title="Top objections" rows={themes.objections || []} />
      <ThemeList title="What CPs ask for" rows={themes.needs || []} />
      <ThemeList title="CP commitments" rows={themes.commitments || []} />
    </div>
  );
}

function Leaderboard({ rows, x }) {
  return (
    <Section title="Rep leaderboard" sub="by visits" action={<SectionCsv x={x} selector={{}} name="supply-rep-leaderboard" />}>
      <Card>
        {rows.length === 0 ? (
          <Empty text="No reps have logged visits yet." />
        ) : (
          rows.map((r, i) => (
            <div key={r.id} className="si-lb">
              <span className="rank">{i + 1}</span>
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="av" src={r.image} alt="" />
              ) : (
                <span className="av fb">{initials(r.name || r.email)}</span>
              )}
              <div className="nm">
                <div className="n">{r.name || r.email}</div>
                <div className="e">{r.email}</div>
              </div>
              <div className="metrics">
                <b>{r.visits}</b> visits <span>·</span> <b>{r.onboarded}</b> onboarded <span>·</span>{' '}
                <b>{r.partners}</b> partners
              </div>
              <style jsx>{`
                .si-lb { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
                .si-lb:last-child { border-bottom: none; }
                .rank { width: 22px; text-align: center; font-weight: 700; color: var(--ink-3); font-size: 13px; }
                .av { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
                .av.fb { display: flex; align-items: center; justify-content: center; background: var(--grad-primary); color: #fff; font-weight: 700; font-size: 13px; }
                .nm { flex: 1; min-width: 0; }
                .n { font-size: 14px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .e { font-size: 11.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .metrics { font-size: 12.5px; color: var(--ink-2); white-space: nowrap; }
                .metrics b { color: var(--ink); }
                .metrics span { color: var(--ink-3); margin: 0 2px; }
                @media (max-width: 620px) { .metrics { display: none; } }
              `}</style>
            </div>
          ))
        )}
      </Card>
    </Section>
  );
}

// Drill-down modal: the visits behind a stat + a CSV of exactly those visits.
function VisitsModal({ drill, onClose }) {
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    document.body.style.overflow = 'hidden';
    fetch(drill.jsonUrl)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setVisits(j.visits || []); })
      .catch(() => { if (!cancelled) setError('Could not load the visits.'); });
    return () => { cancelled = true; document.body.style.overflow = ''; };
  }, [drill.jsonUrl]);

  return (
    <div className="si-modal-bg" onClick={onClose}>
      <div className="si-modal" onClick={(e) => e.stopPropagation()}>
        <div className="si-modal-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="si-modal-eyebrow">Source visits</div>
            <div className="si-modal-title">{drill.title}</div>
            <div className="si-modal-sub">
              {visits ? `${visits.length} visit${visits.length === 1 ? '' : 's'}` : '…'} in this slice
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <DownloadCsv variant="button" label="CSV" title="Download these visits as CSV" href={drill.csvUrl} />
            <button className="si-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        <div className="si-modal-body">
          {!visits && !error && (
            <div className="si-modal-loading"><Loader2 size={15} className="oh-spin" /> Loading visits…</div>
          )}
          {error && <div style={{ color: 'var(--danger)', padding: 12, fontSize: 13 }}>{error}</div>}
          {visits && visits.length === 0 && (
            <div style={{ color: 'var(--ink-3)', padding: 12, fontSize: 13 }}>No visits found in this slice.</div>
          )}
          {visits && visits.map((v) => (
            <div key={v.id} className="si-vrow">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="si-vrow-top">
                  <b>{v.cp_code || v.cp_name || 'CP'}</b>
                  {v.cp_code && v.cp_name ? <span className="muted"> · {v.cp_name}</span> : null}
                </div>
                <div className="si-vrow-meta">
                  {fmtDate(v.check_in_time)}
                  {v.meeting_outcome ? ` · ${v.meeting_outcome.replace(/_/g, ' ')}` : ''}
                  {v.rm_name ? ` · ${v.rm_name}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .si-modal-bg {
          position: fixed; inset: 0; background: rgba(20, 10, 25, 0.45); backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 100;
        }
        .si-modal {
          background: var(--paper); border-radius: 18px; width: 100%; max-width: 560px;
          max-height: 84vh; display: flex; flex-direction: column; overflow: hidden;
          box-shadow: var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.3));
        }
        .si-modal-head {
          display: flex; gap: 12px; align-items: flex-start; padding: 18px 18px 14px;
          border-bottom: 1px solid var(--border);
        }
        .si-modal-eyebrow { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent); font-weight: 700; }
        .si-modal-title { font-size: 18px; font-weight: 700; color: var(--ink); margin: 3px 0; line-height: 1.2; }
        .si-modal-sub { font-size: 12.5px; color: var(--ink-2); }
        .si-x { all: unset; cursor: pointer; padding: 6px; border-radius: 8px; color: var(--ink-3); }
        .si-x:hover { background: var(--paper-2); color: var(--ink); }
        .si-modal-body { overflow-y: auto; padding: 8px 12px 12px; }
        .si-modal-loading { display: flex; align-items: center; gap: 8px; color: var(--ink-3); padding: 16px; font-size: 13px; }
        .si-vrow { padding: 11px 8px; border-bottom: 1px solid var(--border); }
        .si-vrow:last-child { border-bottom: none; }
        .si-vrow-top { font-size: 13.5px; color: var(--ink); }
        .si-vrow-top .muted { color: var(--ink-2); font-weight: 400; }
        .si-vrow-meta { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
      `}</style>
    </div>
  );
}

function AskTab({ period, x }) {
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const SAMPLES = [
    'What are the top objections CPs are raising?',
    'Which competitors or platforms get mentioned most, and in what context?',
    'What do CPs most often ask Openhouse for?',
    'Which societies / micro-markets come up the most?',
  ];

  async function ask(e) {
    e?.preventDefault();
    if (!q.trim() || asking) return;
    setAsking(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/admin/supply/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim(), period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not answer.');
      setResult({ ...data.result, visitCount: data.visitCount });
    } catch (err) {
      setError(err.message);
    } finally {
      setAsking(false);
    }
  }

  const allIds = (result?.items || []).flatMap((it) => it.visitIds || []);
  const uniqueIds = [...new Set(allIds)];

  return (
    <div>
      <form onSubmit={ask} className="si-ask">
        <textarea
          className="oh-textarea"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about the supply visits — objections, competitors, named societies, what CPs want…"
          rows={3}
        />
        <button type="submit" className="oh-btn accent" disabled={asking || !q.trim()} style={{ justifyContent: 'center' }}>
          {asking ? (
            <>
              <Loader2 size={15} className="oh-spin" /> Analysing…
            </>
          ) : (
            <>
              <Send size={15} /> Ask
            </>
          )}
        </button>
      </form>

      {!result && !asking && (
        <div className="si-samples">
          {SAMPLES.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => setQ(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: 'var(--danger-soft)', color: 'var(--danger)', padding: '11px 14px', borderRadius: 12, fontSize: 13, marginTop: 14 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 18 }}>
          <Card>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{result.headline}</div>
              {uniqueIds.length > 0 && (
                <DownloadCsv
                  variant="button"
                  label="Export cited"
                  title="Download every CP visit cited in this answer"
                  href={x.exportHref({ ids: uniqueIds.join(',') }, slug(result.headline))}
                />
              )}
            </div>
            {result.narrative && (
              <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, margin: '8px 0 0' }}>{result.narrative}</p>
            )}
            {Array.isArray(result.items) && result.items.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.items.map((it, i) => {
                  const ids = it.visitIds || [];
                  return (
                    <div key={i} className="si-item">
                      <div className="t">{it.title}</div>
                      {it.value && <div className="v">{it.value}</div>}
                      {ids.length > 0 && (
                        <button
                          type="button"
                          className="r"
                          onClick={() => x.onDrill(it.title, { ids: ids.join(',') }, slug(it.title))}
                        >
                          {ids.length} visit{ids.length === 1 ? '' : 's'} ›
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 14 }}>
              Across {result.visitCount} visits in range.
            </div>
          </Card>
        </div>
      )}

      <style jsx>{`
        .si-ask { display: flex; flex-direction: column; gap: 10px; max-width: 720px; }
        .si-samples { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .si-samples .chip {
          all: unset; cursor: pointer; font-size: 12.5px; color: var(--ink-2);
          background: var(--paper-2); border: 1px solid var(--border); padding: 7px 12px; border-radius: 100px;
        }
        .si-samples .chip:hover { color: var(--accent); border-color: var(--accent); }
        .si-item { border-left: 3px solid var(--accent); padding: 2px 0 2px 12px; }
        .si-item .t { font-size: 13.5px; font-weight: 600; color: var(--ink); }
        .si-item .v { font-size: 13px; color: var(--ink-2); margin-top: 2px; }
        .si-item .r {
          all: unset; cursor: pointer; font-size: 11px; color: var(--accent); margin-top: 3px;
          border-bottom: 1px dashed currentColor;
        }
        .si-item .r:hover { opacity: 0.7; }
      `}</style>
    </div>
  );
}
