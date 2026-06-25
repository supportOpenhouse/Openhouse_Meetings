'use client';

import { useState } from 'react';
import {
  Footprints, Briefcase, Handshake, MessageSquareWarning, Sparkles, Loader2, Send, Package, Users,
} from 'lucide-react';

const PERIODS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 0, label: 'All time' },
];

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);
const initials = (name) => (String(name || '?').trim().charAt(0) || '?').toUpperCase();

export default function SupplyInsightsClient({ initial }) {
  const [period, setPeriod] = useState(90);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('visits');

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

      <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
        {tab === 'visits' && <VisitsTab m={m} data={data} />}
        {tab === 'engagement' && <EngagementTab m={m} />}
        {tab === 'onboarding' && <OnboardingTab m={m} />}
        {tab === 'themes' && <ThemesTab themes={data.themes || {}} />}
        {tab === 'ask' && <AskTab period={period} />}
      </div>

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

function Section({ title, sub, children }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div className="si-sec-head">
        {title}
        {sub && <span>{sub}</span>}
      </div>
      {children}
      <style jsx>{`
        .si-sec-head {
          display: flex; align-items: baseline; justify-content: space-between;
          font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 12px;
        }
        .si-sec-head span { font-size: 12px; font-weight: 500; color: var(--ink-3); }
      `}</style>
    </div>
  );
}

// A horizontal bar row: label, fill proportional to n/total, count + pct.
function BarRow({ label, n, total, tone = 'accent' }) {
  const p = pct(n, total);
  return (
    <div className="si-bar">
      <div className="top">
        <span className="lbl">{label}</span>
        <span className="cnt">
          {n} <em>· {p}%</em>
        </span>
      </div>
      <div className="track">
        <div className={`fill ${tone}`} style={{ width: `${p}%` }} />
      </div>
      <style jsx>{`
        .si-bar { margin-bottom: 12px; }
        .top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
        .lbl { font-size: 13.5px; color: var(--ink); font-weight: 500; }
        .cnt { font-size: 13px; color: var(--ink); font-weight: 600; }
        .cnt em { font-style: normal; color: var(--ink-3); font-weight: 500; }
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
  return (
    <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '8px 0' }}>{text}</div>
  );
}

// ── tabs ──────────────────────────────────────────────────────────────────
function VisitsTab({ m, data }) {
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

      <Section title="Outcomes">
        <Card>
          {total === 0 ? (
            <Empty text="No ready visits in this period yet." />
          ) : (
            <>
              <BarRow label="Onboarded" n={m.onboarded || 0} total={total} tone="green" />
              <BarRow label="Follow-up required" n={m.follow_up || 0} total={total} tone="amber" />
              <BarRow label="Future potential" n={m.future_potential || 0} total={total} tone="accent" />
              <BarRow label="Not interested" n={m.not_interested || 0} total={total} tone="red" />
            </>
          )}
        </Card>
      </Section>

      <Section title="First vs repeat">
        <Card>
          <BarRow label="First visit" n={m.first_visits || 0} total={total} tone="accent" />
          <BarRow label="Repeat visit" n={m.repeat_visits || 0} total={total} tone="amber" />
        </Card>
      </Section>

      <Section title="Visits per week">
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

      <Leaderboard rows={data.leaderboard || []} />
    </div>
  );
}

function EngagementTab({ m }) {
  const total = m.total || 0;
  return (
    <div>
      <Section title="CP sentiment" sub="AI-read from each visit">
        <Card>
          {total === 0 ? (
            <Empty text="No data yet." />
          ) : (
            <>
              <BarRow label="Positive" n={m.sent_positive || 0} total={total} tone="green" />
              <BarRow label="Neutral" n={m.sent_neutral || 0} total={total} tone="grey" />
              <BarRow label="Disengaged" n={m.sent_disengaged || 0} total={total} tone="red" />
            </>
          )}
        </Card>
      </Section>
      <Section title="Rep-logged engagement">
        <Card>
          <BarRow label="Positive" n={m.eng_positive || 0} total={total} tone="green" />
          <BarRow label="Neutral" n={m.eng_neutral || 0} total={total} tone="grey" />
          <BarRow label="Disengaged" n={m.eng_disengaged || 0} total={total} tone="red" />
        </Card>
      </Section>
    </div>
  );
}

function OnboardingTab({ m }) {
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
      <Section title="Onboarding stage" sub="journey position">
        <Card>
          {total === 0 ? (
            <Empty text="No data yet." />
          ) : (
            <>
              <BarRow label="Onboarded" n={m.stage_onboarded || 0} total={total} tone="green" />
              <BarRow label="Ready to onboard" n={m.stage_ready || 0} total={total} tone="accent" />
              <BarRow label="Evaluating" n={m.stage_evaluating || 0} total={total} tone="amber" />
              <BarRow label="Not interested" n={m.stage_not_interested || 0} total={total} tone="red" />
            </>
          )}
        </Card>
      </Section>
    </div>
  );
}

function ThemeList({ title, icon: Icon, rows }) {
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
        cited analysis across transcripts.
      </p>
      <ThemeList title="Top objections" icon={MessageSquareWarning} rows={themes.objections || []} />
      <ThemeList title="What CPs ask for" icon={Package} rows={themes.needs || []} />
      <ThemeList title="CP commitments" icon={Handshake} rows={themes.commitments || []} />
    </div>
  );
}

function Leaderboard({ rows }) {
  return (
    <Section title="Rep leaderboard" sub="by visits">
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

function AskTab({ period }) {
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
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{result.headline}</div>
            {result.narrative && (
              <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, margin: '8px 0 0' }}>{result.narrative}</p>
            )}
            {Array.isArray(result.items) && result.items.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.items.map((it, i) => (
                  <div key={i} className="si-item">
                    <div className="t">{it.title}</div>
                    {it.value && <div className="v">{it.value}</div>}
                    {it.visitIds?.length > 0 && <div className="r">{it.visitIds.length} visit{it.visitIds.length === 1 ? '' : 's'}</div>}
                  </div>
                ))}
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
        .si-item .r { font-size: 11px; color: var(--ink-3); margin-top: 2px; }
      `}</style>
    </div>
  );
}
