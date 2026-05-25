'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Loader2,
  Flame,
  TrendingUp,
  Snowflake,
  Home,
  Briefcase,
  Handshake,
  Target,
  Send,
  AlertCircle,
  X,
  Volume2,
  Phone,
  Calendar,
  Users,
  Bookmark,
  BookmarkCheck,
  Trash2,
} from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { fmtDate, fmtDuration } from '@/lib/utils';
import MeetingDetail from '@/components/MeetingDetail';

const PERIODS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 0, label: 'All time' },
];

// Which Tier-2 insight cards live under each tab.
const TAB_INSIGHTS = {
  visit: ['visit_societies', 'visit_config_budget', 'visit_blockers', 'visit_objections'],
  engagement: ['engagement_cp_issues', 'engagement_cp_asks'],
  onboarding: ['onboarding_objections', 'onboarding_competitors'],
  direct: ['direct_demand', 'direct_blockers', 'direct_pipeline', 'direct_awareness'],
  cross_cut: ['cross_growth', 'cross_pipeline'],
};

const INSIGHT_TITLES = {
  visit_societies: 'Top societies buyers want',
  visit_config_budget: 'Configuration & budget demand',
  visit_blockers: 'Why buyers are not closing',
  visit_objections: 'Top objections during visits',
  engagement_cp_issues: 'Issues CPs raise about Openhouse',
  engagement_cp_asks: 'What CPs are asking for',
  onboarding_objections: 'Objections that block onboarding',
  onboarding_competitors: 'Competitors prospective CPs use',
  direct_demand: 'What buyers want',
  direct_blockers: "Why buyers aren't booking",
  direct_pipeline: 'Hot-buyer pipeline read',
  direct_awareness: 'Affordable-housing awareness gaps',
  cross_growth: 'How to increase visits & buyers',
  cross_pipeline: 'Immediate-buyer pipeline read',
};

export default function InsightsClient({ initialData }) {
  const [data, setData] = useState(initialData);
  const rms = initialData.rms || [];
  // Single source of truth for the date window: dateSince + dateUntil. Period
  // preset buttons are shortcuts that write into these. Defaults are computed
  // on the server (IST) and passed in via initialData so SSR + hydration
  // produce identical date strings.
  const [dateSince, setDateSince] = useState(initialData.defaultSince || nDaysAgoValue(initialData.period || 90));
  const [dateUntil, setDateUntil] = useState(initialData.defaultUntil || todayValue());
  // Guard time-dependent display (active-preset highlight, "Custom range" tag)
  // until after mount — avoids any hydration drift around the IST midnight tick.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [rmFilter, setRmFilter] = useState('all');
  const [tab, setTab] = useState('visit');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(null);
  const [genError, setGenError] = useState(null);

  // Ask-anything state
  const [question, setQuestion] = useState('');
  const [askScope, setAskScope] = useState('all');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState(null);

  // Which preset (if any) the current date window matches — so the right
  // pill highlights, and the date inputs feel coordinated with the presets.
  const activePresetValue = useMemo(() => {
    if (!dateSince && !dateUntil) return 0; // All time
    const today = todayValue();
    if (dateUntil !== today) return -1; // custom
    if (dateSince === nDaysAgoValue(30)) return 30;
    if (dateSince === nDaysAgoValue(90)) return 90;
    return -1;
  }, [dateSince, dateUntil]);

  // Equivalent periodDays for the server (used as storage hint on cached
  // insights). 0 = all time. Custom range computes the day span.
  const period = useMemo(() => {
    if (!dateSince) return 0;
    const s = new Date(`${dateSince}T00:00:00`);
    const u = dateUntil ? new Date(`${dateUntil}T23:59:59`) : new Date();
    if (isNaN(s) || isNaN(u)) return 0;
    return Math.max(1, Math.round((u - s) / 86400000));
  }, [dateSince, dateUntil]);

  // Mounted guard — avoids briefly flashing the Clear button during hydration
  // if IST-day math drifts between server and client.
  const filtersActive = mounted && (activePresetValue !== 90 || rmFilter !== 'all');

  function applyPreset(value) {
    if (value === 0) {
      setDateSince('');
      setDateUntil('');
    } else {
      setDateSince(nDaysAgoValue(value));
      setDateUntil(todayValue());
    }
  }

  function clearFilters() {
    setDateSince(nDaysAgoValue(90));
    setDateUntil(todayValue());
    setRmFilter('all');
  }

  // Build the API querystring from current filters.
  const filterParams = useCallback(() => {
    const qs = new URLSearchParams();
    qs.set('period', String(period));
    if (dateSince) qs.set('since', `${dateSince}T00:00:00`);
    if (dateUntil) qs.set('until', `${dateUntil}T23:59:59`);
    if (rmFilter !== 'all') qs.set('rm', rmFilter);
    return qs;
  }, [period, dateSince, dateUntil, rmFilter]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/insights?${filterParams().toString()}`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  // Auto-refetch when filters change, debounced so rapid date-keystroke edits
  // collapse into one request. Skip the very first render — initialData is
  // already in state.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const t = setTimeout(refetch, 300);
    return () => clearTimeout(t);
  }, [refetch]);

  // The filter payload AI insights + Ask must use.
  function filterBody() {
    return {
      period,
      since: dateSince ? `${dateSince}T00:00:00` : null,
      until: dateUntil ? `${dateUntil}T23:59:59` : null,
      rmId: rmFilter !== 'all' ? rmFilter : null,
    };
  }

  async function generate(insightKey) {
    setGenerating(insightKey);
    setGenError(null);
    try {
      const r = await fetch('/api/admin/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight_key: insightKey, ...filterBody() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Generation failed');
      setData((d) => ({ ...d, standard: { ...d.standard, [insightKey]: j.insight } }));
    } catch (e) {
      setGenError({ key: insightKey, message: e.message });
    } finally {
      setGenerating(null);
    }
  }

  // Pin a generated insight — it survives future Refresh clicks and shows up
  // in the "Saved insights" section at the bottom of its tab.
  async function savePinned(id) {
    try {
      const r = await fetch(`/api/admin/insights/${id}/pin`, { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Save failed');
      setData((d) => ({
        ...d,
        standard: Object.fromEntries(
          Object.entries(d.standard || {}).map(([k, v]) => [
            k,
            v && v.id === id ? { ...v, pinned: true } : v,
          ])
        ),
        pinned: [j.insight, ...(d.pinned || []).filter((p) => p.id !== id)],
      }));
    } catch (e) {
      setGenError({ key: null, message: e.message });
    }
  }

  // Delete a saved insight row. If it happened to be the displayed-latest for
  // its key, the next refetch surfaces whatever older row exists.
  async function deletePinned(id) {
    if (!confirm('Delete this saved insight?')) return;
    try {
      const r = await fetch(`/api/admin/insights/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Delete failed');
      setData((d) => ({ ...d, pinned: (d.pinned || []).filter((p) => p.id !== id) }));
      refetch();
    } catch (e) {
      setGenError({ key: null, message: e.message });
    }
  }

  async function ask() {
    const q = question.trim();
    if (q.length < 5) return;
    setAsking(true);
    setAskError(null);
    try {
      const r = await fetch('/api/admin/insights/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, scope: askScope, ...filterBody() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Question failed');
      setData((d) => ({ ...d, custom: [j.insight, ...d.custom] }));
      setQuestion('');
    } catch (e) {
      setAskError(e.message);
    } finally {
      setAsking(false);
    }
  }

  const t1 = data.tier1;

  return (
    <div className="oh-page" style={{ maxWidth: 1100 }}>
      <div className="oh-eyebrow">Admin · Analytics</div>
      <h1 className="oh-h1">
        Meeting <em>insights</em>
      </h1>
      <p className="oh-sub">
        Structured metrics are computed live from stored data — free, instant. AI insights read the
        same data (never ElevenLabs) and are generated on demand, then cached.
      </p>

      <div className="oh-ins-toolbar">
        <div className="oh-ins-periods">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={`oh-ins-period ${mounted && activePresetValue === p.value ? 'active' : ''}`}
              onClick={() => applyPreset(p.value)}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
          {mounted && activePresetValue === -1 && (
            <span className="oh-ins-custom-tag">Custom range</span>
          )}
          {loading && <Loader2 size={14} className="oh-spin" />}
        </div>

        <div className="oh-ins-filter-row">
          <label className="oh-ins-field">
            <span><Calendar size={11} /> From</span>
            <input
              className="oh-input oh-date"
              type="date"
              value={dateSince}
              onChange={(e) => setDateSince(e.target.value)}
              aria-label="From date"
            />
          </label>
          <label className="oh-ins-field">
            <span><Calendar size={11} /> To</span>
            <input
              className="oh-input oh-date"
              type="date"
              value={dateUntil}
              onChange={(e) => setDateUntil(e.target.value)}
              aria-label="To date"
            />
          </label>
          {rms.length > 0 && (
            <label className="oh-ins-field">
              <span><Users size={11} /> RM</span>
              <select
                className="oh-select"
                value={rmFilter}
                onChange={(e) => setRmFilter(e.target.value)}
                aria-label="Filter by RM"
              >
                <option value="all">All RMs</option>
                {rms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name || r.email}</option>
                ))}
              </select>
            </label>
          )}
          {filtersActive && (
            <button type="button" className="oh-btn ghost oh-ins-clear" onClick={clearFilters}>
              <X size={13} /> Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="oh-ins-tabs">
        <TabBtn active={tab === 'visit'} onClick={() => setTab('visit')} icon={Home} label="Visit" />
        <TabBtn active={tab === 'engagement'} onClick={() => setTab('engagement')} icon={Briefcase} label="Engagement" />
        <TabBtn active={tab === 'onboarding'} onClick={() => setTab('onboarding')} icon={Handshake} label="Onboarding" />
        <TabBtn active={tab === 'direct'} onClick={() => setTab('direct')} icon={Phone} label="Direct" />
        <TabBtn active={tab === 'cross_cut'} onClick={() => setTab('cross_cut')} icon={Target} label="Cross-cut" />
        <TabBtn active={tab === 'ask'} onClick={() => setTab('ask')} icon={Sparkles} label="Ask anything" />
      </div>

      {tab === 'visit' && <VisitTab m={t1.visit} />}
      {tab === 'engagement' && <EngagementTab m={t1.engagement} />}
      {tab === 'onboarding' && <OnboardingTab m={t1.onboarding} />}
      {tab === 'direct' && <DirectTab m={t1.direct} />}
      {tab === 'cross_cut' && <CrossCutTab cpFocus={t1.cpFocus} />}

      {tab !== 'ask' && (
        <div className="oh-ins-ai-section">
          <div className="oh-ins-section-head">
            <Sparkles size={14} /> AI insights — generated on demand
          </div>
          {TAB_INSIGHTS[tab].map((key) => (
            <InsightCard
              key={key}
              insightKey={key}
              title={INSIGHT_TITLES[key]}
              cached={data.standard[key]}
              generating={generating === key}
              error={genError?.key === key ? genError.message : null}
              onGenerate={() => generate(key)}
              onSave={savePinned}
            />
          ))}
        </div>
      )}

      {tab !== 'ask' && (
        <SavedInsightsSection
          pinned={(data.pinned || []).filter((p) => p.scope === tab)}
          onDelete={deletePinned}
        />
      )}

      {tab === 'ask' && (
        <AskTab
          question={question}
          setQuestion={setQuestion}
          askScope={askScope}
          setAskScope={setAskScope}
          asking={asking}
          askError={askError}
          onAsk={ask}
          custom={data.custom}
        />
      )}

      <style jsx>{`
        .oh-ins-toolbar { margin: 16px 0 8px; }
        .oh-ins-periods { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .oh-ins-period {
          all: unset;
          cursor: pointer;
          font-size: 12.5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--ink-2);
        }
        .oh-ins-period.active {
          background: var(--ink);
          color: var(--paper);
          border-color: var(--ink);
        }
        .oh-ins-custom-tag {
          font-size: 11px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--ink-3);
          margin-left: 4px;
        }
        .oh-ins-filter-row {
          display: flex;
          gap: 12px;
          align-items: flex-end;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .oh-ins-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .oh-ins-field > span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          color: var(--ink-3);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .oh-ins-clear { align-self: flex-end; }
        .oh-ins-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--border);
          margin: 14px 0 20px;
          overflow-x: auto;
        }
        .oh-ins-ai-section { margin-top: 28px; }
        .oh-ins-section-head {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-3);
          font-weight: 600;
          margin-bottom: 12px;
        }
      `}</style>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className={`oh-ins-tab ${active ? 'active' : ''}`}>
      <Icon size={13} /> {label}
      <style jsx>{`
        .oh-ins-tab {
          all: unset;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          font-size: 13.5px;
          color: var(--ink-2);
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          white-space: nowrap;
        }
        .oh-ins-tab.active {
          color: var(--ink);
          border-bottom-color: var(--accent);
          font-weight: 500;
        }
      `}</style>
    </button>
  );
}

/* ---- Tier 1 tabs ---- */

function StatGrid({ children }) {
  return (
    <div className="oh-ins-stats">
      {children}
      <style jsx>{`
        .oh-ins-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }
      `}</style>
    </div>
  );
}

function VisitTab({ m }) {
  return (
    <div>
      <StatGrid>
        <Stat label="Site visits" value={m.total} />
        <Stat label="Immediate buyers" value={m.immediateBuyers} accent />
        <Stat label="Avg lead score" value={m.avgScore != null ? `${m.avgScore}/100` : '—'} />
        <TempStat mix={m.byClassification} labels={['hot', 'warm', 'cold']} />
      </StatGrid>

      <Panel title="Visit funnel — what's happening on site">
        {m.funnel.map((f) => (
          <BarRow key={f.key} label={f.label} pct={f.pct} caption={`${f.met}/${f.total}`} />
        ))}
      </Panel>

      <div className="oh-ins-2col">
        <Panel title="Weekly visit volume">
          <Sparkbars data={m.volumeByWeek} />
        </Panel>
        <Panel title="RM leaderboard (visits · avg score)">
          {m.topRms.length === 0 && <Empty />}
          {m.topRms.map((r, i) => (
            <RankRow key={i} rank={i + 1} name={r.rm_name || '—'} value={`${r.visits} · ${r.avg_score ?? '—'}`} />
          ))}
        </Panel>
      </div>
      <style jsx>{`
        .oh-ins-2col {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }
        @media (max-width: 760px) { .oh-ins-2col { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

function EngagementTab({ m }) {
  return (
    <div>
      <StatGrid>
        <Stat label="Engagement meetings" value={m.total} />
        <TempStat mix={m.bySentiment} labels={['hot', 'warm', 'cold']} />
      </StatGrid>
      <div className="oh-ins-2col">
        <Panel title="Weekly volume">
          <Sparkbars data={m.volumeByWeek} />
        </Panel>
        <Panel title="RM leaderboard (meetings)">
          {m.topRms.length === 0 && <Empty />}
          {m.topRms.map((r, i) => (
            <RankRow key={i} rank={i + 1} name={r.rm_name || '—'} value={r.meetings} />
          ))}
        </Panel>
      </div>
      <style jsx>{`
        .oh-ins-2col {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }
        @media (max-width: 760px) { .oh-ins-2col { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

function OnboardingTab({ m }) {
  const f = m.outcomeFunnel;
  return (
    <div>
      <StatGrid>
        <Stat label="Onboarding pitches" value={m.total} />
        <Stat label="Conversion" value={`${m.conversionPct}%`} accent />
        <Stat label="Will join" value={f.willJoin} />
        <Stat label="Declined" value={f.declined} />
      </StatGrid>
      <Panel title="Outcome funnel">
        <BarRow label="Will join" pct={pct(f.willJoin, m.total)} caption={String(f.willJoin)} tone="ok" />
        <BarRow label="Undecided" pct={pct(f.undecided, m.total)} caption={String(f.undecided)} tone="warn" />
        <BarRow label="Declined" pct={pct(f.declined, m.total)} caption={String(f.declined)} tone="bad" />
      </Panel>
      <Panel title="Weekly volume">
        <Sparkbars data={m.volumeByWeek} />
      </Panel>
    </div>
  );
}

function DirectTab({ m }) {
  if (!m || m.total === 0) {
    return <Empty text="No direct-RM call recordings in this range yet." />;
  }
  return (
    <div>
      <StatGrid>
        <Stat label="Buyer calls" value={m.total} />
        <Stat label="Hot buyers" value={m.bySentiment.hot} accent />
        <TempStat mix={m.bySentiment} />
      </StatGrid>

      <div className="oh-ins-2col">
        <Panel title="Buyer journey stage">
          <DistBars rows={m.journeyStage} total={m.total} />
        </Panel>
        <Panel title="Move-in timeline">
          <DistBars rows={m.timeline} total={m.total} />
        </Panel>
      </div>

      <div className="oh-ins-2col">
        <Panel title="Budget demand">
          <DistBars rows={m.budget} total={m.total} />
        </Panel>
        <Panel title="BHK configuration demand">
          <DistBars rows={m.configuration} total={m.total} />
        </Panel>
      </div>

      <Panel title="What's stopping buyers from booking">
        <DistBars rows={m.blockers} total={m.total} />
      </Panel>

      <Panel title="Top buyer frustrations">
        <DistBars rows={m.frustrations} total={m.total} />
      </Panel>

      <div className="oh-ins-2col">
        <Panel title="Weekly call volume">
          <Sparkbars data={m.volumeByWeek} />
        </Panel>
        <Panel title="Top RMs by call volume">
          {m.topRms.length === 0 && <Empty />}
          {m.topRms.map((r, i) => (
            <RankRow key={i} rank={i + 1} name={r.rm_name || '—'} value={r.meetings} />
          ))}
        </Panel>
      </div>

      <style jsx>{`
        .oh-ins-2col {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }
        @media (max-width: 760px) { .oh-ins-2col { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

// Renders a {label, n} distribution as proportion bars.
function DistBars({ rows, total }) {
  if (!rows || rows.length === 0) return <Empty />;
  return (
    <>
      {rows.map((r, i) => (
        <BarRow key={i} label={shortLabel(r.label)} pct={pct(r.n, total)} caption={String(r.n)} />
      ))}
    </>
  );
}

function CrossCutTab({ cpFocus }) {
  return (
    <div>
      <Panel title="CPs to focus on now — recorded visits dropped month-on-month">
        {cpFocus.length === 0 && <Empty text="No CPs with a month-on-month visit drop." />}
        {cpFocus.map((c) => (
          <div key={c.cp_code} className="oh-ins-focus-row">
            <div>
              <span className="oh-mono" style={{ fontWeight: 600 }}>{c.cp_code}</span>
              {c.rm_name && <span style={{ color: 'var(--ink-3)', fontSize: 12 }}> · {c.rm_name}</span>}
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{c.reason}</div>
            </div>
            <div className="oh-ins-focus-drop">−{c.drop}</div>
          </div>
        ))}
      </Panel>
      <style jsx>{`
        .oh-ins-focus-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 9px 0;
          border-bottom: 1px solid var(--border);
        }
        .oh-ins-focus-row:last-child { border-bottom: none; }
        .oh-ins-focus-drop {
          font-family: 'Geist Mono', monospace;
          font-weight: 600;
          color: var(--danger, #b03021);
          font-size: 14px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

/* ---- Ask anything ---- */

function AskTab({ question, setQuestion, askScope, setAskScope, asking, askError, onAsk, custom }) {
  return (
    <div>
      <div className="oh-ask-box">
        <textarea
          className="oh-textarea"
          placeholder="Ask anything across the meetings — e.g. 'Which budget segment has the most hot buyers?' or 'What do CPs in Noida complain about most?'"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
        />
        <div className="oh-ask-actions">
          <select className="oh-input" value={askScope} onChange={(e) => setAskScope(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="all">All meeting types</option>
            <option value="visit">Visits only</option>
            <option value="engagement">Engagement only</option>
            <option value="onboarding">Onboarding only</option>
            <option value="call">Direct calls only</option>
          </select>
          <button className="oh-btn accent" onClick={onAsk} disabled={asking || question.trim().length < 5}>
            {asking ? <Loader2 size={14} className="oh-spin" /> : <Send size={14} />}
            {asking ? 'Thinking…' : 'Ask'}
          </button>
        </div>
        {askError && <div className="oh-ask-err"><AlertCircle size={13} /> {askError}</div>}
      </div>

      <div className="oh-ins-section-head" style={{ marginTop: 24 }}>
        <Sparkles size={14} /> Past questions
      </div>
      {custom.length === 0 && <Empty text="No questions asked yet." />}
      {custom.map((c) => (
        <div key={c.id} className="oh-ask-result">
          <div className="oh-ask-q">{c.question}</div>
          <InsightBody result={c.result} />
          <div className="oh-ins-meta">
            {c.meeting_count} meetings · {relative(c.generated_at)}
          </div>
        </div>
      ))}

      <style jsx>{`
        .oh-ask-box {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
        }
        .oh-ask-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        .oh-ask-err {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--danger, #b03021);
          font-size: 13px;
          margin-top: 8px;
        }
        .oh-ask-result {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 10px;
        }
        .oh-ask-q {
          font-weight: 600;
          font-size: 14px;
          color: var(--ink);
          margin-bottom: 8px;
        }
        .oh-ins-meta { font-size: 11.5px; color: var(--ink-3); margin-top: 8px; }
      `}</style>
    </div>
  );
}

/* ---- AI insight card ---- */

function InsightCard({ insightKey, title, cached, generating, error, onGenerate, onSave }) {
  const isPinned = !!cached?.pinned;
  return (
    <div className="oh-ins-card">
      <div className="oh-ins-card-head">
        <div className="oh-ins-card-title">{title}</div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {cached && onSave && (
            <button
              className="oh-btn ghost"
              onClick={() => onSave(cached.id)}
              disabled={isPinned}
              title={
                isPinned
                  ? 'Saved — see "Saved insights" below. Regenerate to save a new version.'
                  : 'Save this insight so it survives future Refresh clicks'
              }
            >
              {isPinned ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
              {isPinned ? 'Saved' : 'Save'}
            </button>
          )}
          <button className="oh-btn ghost" onClick={onGenerate} disabled={generating}>
            {generating ? <Loader2 size={13} className="oh-spin" /> : <RefreshCw size={13} />}
            {generating ? 'Generating…' : cached ? 'Refresh' : 'Generate'}
          </button>
        </div>
      </div>
      {error && <div className="oh-ask-err" style={{ marginTop: 8 }}><AlertCircle size={13} /> {error}</div>}
      {!cached && !generating && !error && (
        <div className="oh-ins-empty-card">
          Not generated yet. Tap Generate — one Claude pass over the stored summaries (no ElevenLabs).
        </div>
      )}
      {cached && (
        <>
          <InsightBody result={cached.result} />
          <div className="oh-ins-meta">{cached.meeting_count} meetings · {relative(cached.generated_at)}</div>
        </>
      )}
      <style jsx>{`
        .oh-ins-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 10px;
        }
        .oh-ins-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .oh-ins-card-title { font-weight: 600; font-size: 14.5px; color: var(--ink); }
        .oh-ins-empty-card {
          margin-top: 10px;
          font-size: 13px;
          color: var(--ink-3);
          background: var(--paper-2);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .oh-ins-meta { font-size: 11.5px; color: var(--ink-3); margin-top: 10px; }
      `}</style>
    </div>
  );
}

// "Saved insights" — the admin's pinned snapshots for the current tab.
// Each one was a specific Refresh result the admin chose to keep around;
// they stay until the trash icon is clicked.
function SavedInsightsSection({ pinned, onDelete }) {
  if (!pinned || pinned.length === 0) return null;
  return (
    <div className="oh-ins-saved-section">
      <div className="oh-ins-section-head">
        <Bookmark size={14} /> Saved insights ({pinned.length})
      </div>
      {pinned.map((p) => (
        <div key={p.id} className="oh-ins-saved-card">
          <div className="oh-ins-saved-head">
            <div className="oh-ins-saved-title">{p.title}</div>
            <button
              className="oh-btn ghost oh-ins-saved-del"
              onClick={() => onDelete(p.id)}
              title="Delete this saved insight"
              aria-label="Delete saved insight"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <InsightBody result={p.result} />
          <div className="oh-ins-meta">
            {p.meeting_count} meetings · saved {relative(p.generated_at)}
          </div>
        </div>
      ))}
      <style jsx>{`
        .oh-ins-saved-section {
          margin-top: 28px;
          padding-top: 18px;
          border-top: 1px dashed var(--border);
        }
        .oh-ins-saved-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 10px;
        }
        .oh-ins-saved-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .oh-ins-saved-title { font-weight: 600; font-size: 14.5px; color: var(--ink); }
        .oh-ins-saved-del {
          padding: 6px 10px;
          color: var(--ink-3);
          flex-shrink: 0;
        }
        .oh-ins-saved-del:hover { color: #b03021; }
        .oh-ins-meta { font-size: 11.5px; color: var(--ink-3); margin-top: 10px; }
      `}</style>
    </div>
  );
}

function InsightBody({ result }) {
  const [openItem, setOpenItem] = useState(null);
  if (!result) return null;
  return (
    <div className="oh-ins-body">
      {result.headline && <div className="oh-ins-headline">{result.headline}</div>}
      {Array.isArray(result.items) && result.items.length > 0 && (
        <div className="oh-ins-items">
          {result.items.map((it, i) => {
            const ids = Array.isArray(it.meeting_ids) ? it.meeting_ids : [];
            return (
              <div key={i} className="oh-ins-item">
                <span className="oh-ins-item-rank">{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="oh-ins-item-top">
                    <span className="oh-ins-item-label">{it.label}</span>
                    {it.value &&
                      (ids.length > 0 ? (
                        <button
                          className="oh-ins-item-value clickable"
                          onClick={() => setOpenItem({ label: it.label, ids })}
                          title="Listen to the source recordings"
                        >
                          {it.value} ›
                        </button>
                      ) : (
                        <span className="oh-ins-item-value">{it.value}</span>
                      ))}
                  </div>
                  {it.note && <div className="oh-ins-item-note">{it.note}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {result.narrative && <div className="oh-ins-narrative">{result.narrative}</div>}
      {openItem && (
        <MentionsModal
          label={openItem.label}
          ids={openItem.ids}
          onClose={() => setOpenItem(null)}
        />
      )}
      <style jsx>{`
        .oh-ins-body { margin-top: 10px; }
        .oh-ins-headline {
          font-family: 'Instrument Serif', serif;
          font-size: 19px;
          line-height: 1.3;
          color: var(--ink);
          margin-bottom: 10px;
        }
        .oh-ins-items { display: flex; flex-direction: column; gap: 2px; }
        .oh-ins-item {
          display: flex;
          gap: 10px;
          padding: 7px 0;
          border-bottom: 1px solid var(--border);
        }
        .oh-ins-item:last-child { border-bottom: none; }
        .oh-ins-item-rank {
          font-family: 'Geist Mono', monospace;
          font-size: 11px;
          color: var(--ink-3);
          width: 16px;
          flex-shrink: 0;
          padding-top: 1px;
        }
        .oh-ins-item-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: baseline;
        }
        .oh-ins-item-label { font-weight: 500; font-size: 13.5px; color: var(--ink); }
        .oh-ins-item-value {
          font-family: 'Geist Mono', monospace;
          font-size: 11.5px;
          color: var(--accent);
          flex-shrink: 0;
        }
        .oh-ins-item-value.clickable {
          all: unset;
          font-family: 'Geist Mono', monospace;
          font-size: 11.5px;
          color: var(--accent);
          flex-shrink: 0;
          cursor: pointer;
          border-bottom: 1px dashed currentColor;
          white-space: nowrap;
        }
        .oh-ins-item-value.clickable:hover { opacity: 0.7; }
        .oh-ins-item-note { font-size: 12.5px; color: var(--ink-2); margin-top: 2px; }
        .oh-ins-narrative {
          font-size: 13.5px;
          color: var(--ink-2);
          line-height: 1.55;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px dashed var(--border);
        }
      `}</style>
    </div>
  );
}

/* ---- mentions modal: the recordings behind an insight item ---- */

function MentionsModal({ label, ids, onClose }) {
  const [meetings, setMeetings] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);       // full meeting object
  const [detailLoadingId, setDetailLoadingId] = useState(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    let cancelled = false;
    fetch(`/api/admin/insights/meetings?ids=${encodeURIComponent(ids.join(','))}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setMeetings(j.meetings || []); })
      .catch(() => { if (!cancelled) setError('Could not load the recordings.'); });
    return () => {
      cancelled = true;
      document.body.style.overflow = '';
    };
  }, [ids]);

  // Fetch the full meeting (transcript, summary, score, audio) and open the
  // same detailed view used on the dashboard.
  async function openDetail(id) {
    setDetailLoadingId(id);
    try {
      const r = await fetch(`/api/meetings/${id}`);
      const j = await r.json();
      if (r.ok && j.meeting) setDetail(j.meeting);
      else setError('Could not open that meeting.');
    } catch {
      setError('Could not open that meeting.');
    } finally {
      setDetailLoadingId(null);
    }
  }

  return (
    <>
      <div className="oh-modal-bg" onClick={onClose}>
        <div className="oh-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
          <div className="oh-modal-header">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="oh-eyebrow">
                <Volume2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                Source recordings
              </div>
              <h2 className="oh-mention-title">{label}</h2>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                {ids.length} {ids.length === 1 ? 'recording' : 'recordings'} behind this insight —
                tap one to see its transcript &amp; summary
              </div>
            </div>
            <button className="oh-btn ghost" onClick={onClose} aria-label="Close" style={{ padding: 8 }}>
              <X size={16} />
            </button>
          </div>
          <div className="oh-modal-body">
            {!meetings && !error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-3)', padding: 16 }}>
                <Loader2 size={15} className="oh-spin" /> Loading recordings…
              </div>
            )}
            {error && <div style={{ color: 'var(--danger, #b03021)', padding: 12 }}>{error}</div>}
            {meetings && meetings.length === 0 && (
              <div style={{ color: 'var(--ink-3)', padding: 12 }}>
                No recordings found — they may have been deleted.
              </div>
            )}
            {meetings &&
              meetings.map((m) => (
                <button
                  key={m.id}
                  className="oh-mention-row"
                  onClick={() => openDetail(m.id)}
                  disabled={detailLoadingId === m.id}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="oh-mention-head">
                      <span className="oh-mono" style={{ fontWeight: 600 }}>
                        {m.cp_code || m.cp_name || 'CP'}
                      </span>
                      {m.cp_code && m.cp_name && (
                        <span style={{ color: 'var(--ink-2)' }}> · {m.cp_name}</span>
                      )}
                      <span className="oh-mention-type">{m.meeting_type}</span>
                    </div>
                    <div className="oh-mention-meta">
                      {fmtDate(m.started_at)} · {fmtDuration(m.duration_seconds)}
                      {m.rm_name ? ` · ${m.rm_name}` : ''}
                    </div>
                  </div>
                  <span className="oh-mention-go">
                    {detailLoadingId === m.id ? (
                      <Loader2 size={15} className="oh-spin" />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </span>
                </button>
              ))}
          </div>
        </div>

        <style jsx>{`
          .oh-mention-title {
            font-family: 'Instrument Serif', serif;
            font-size: 22px;
            margin: 4px 0 4px;
            line-height: 1.2;
          }
          .oh-mention-row {
            all: unset;
            box-sizing: border-box;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 11px 13px;
            margin-bottom: 9px;
            background: var(--paper);
            transition: border-color 0.12s, background 0.12s;
          }
          .oh-mention-row:hover {
            border-color: var(--ink-2);
            background: var(--paper-2);
          }
          .oh-mention-row:disabled { opacity: 0.6; cursor: default; }
          .oh-mention-head {
            font-size: 14px;
            color: var(--ink);
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
          }
          .oh-mention-type {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--ink-3);
            background: var(--paper-2);
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: 1px 7px;
          }
          .oh-mention-meta {
            font-size: 12px;
            color: var(--ink-3);
            margin-top: 2px;
          }
          .oh-mention-go {
            color: var(--ink-3);
            flex-shrink: 0;
            display: inline-flex;
          }
        `}</style>
      </div>

      {detail && (
        <MeetingDetail
          meeting={detail}
          onClose={() => setDetail(null)}
          onDelete={() => {}}
          canDelete={false}
        />
      )}
    </>
  );
}

/* ---- small shared bits ---- */

function Stat({ label, value, accent }) {
  return (
    <div className={`oh-ins-stat ${accent ? 'accent' : ''}`}>
      <div className="v">{value}</div>
      <div className="l">{label}</div>
      <style jsx>{`
        .oh-ins-stat {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px;
        }
        .oh-ins-stat.accent { border-color: var(--accent); background: rgba(184, 52, 28, 0.04); }
        .v { font-family: 'Instrument Serif', serif; font-size: 28px; line-height: 1; color: var(--ink); }
        .l { font-size: 11.5px; color: var(--ink-3); margin-top: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
      `}</style>
    </div>
  );
}

function TempStat({ mix }) {
  return (
    <div className="oh-ins-stat">
      <div className="row">
        <span className="hot"><Flame size={12} /> {mix.hot}</span>
        <span className="warm"><TrendingUp size={12} /> {mix.warm}</span>
        <span className="cold"><Snowflake size={12} /> {mix.cold}</span>
      </div>
      <div className="l">Hot / Warm / Cold</div>
      <style jsx>{`
        .oh-ins-stat {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px;
        }
        .row { display: flex; gap: 12px; font-family: 'Geist Mono', monospace; font-size: 17px; }
        .row span { display: inline-flex; align-items: center; gap: 4px; }
        .hot { color: #b8341c; }
        .warm { color: #b97417; }
        .cold { color: #4a6b7a; }
        .l { font-size: 11.5px; color: var(--ink-3); margin-top: 7px; text-transform: uppercase; letter-spacing: 0.05em; }
      `}</style>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="oh-ins-panel">
      <div className="oh-ins-panel-title">{title}</div>
      {children}
      <style jsx>{`
        .oh-ins-panel {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          margin-top: 14px;
          min-width: 0;
          overflow: hidden;
        }
        .oh-ins-panel-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 10px;
        }
      `}</style>
    </div>
  );
}

function BarRow({ label, pct, caption, tone }) {
  const color = tone === 'ok' ? '#2f6f2f' : tone === 'warn' ? '#b97417' : tone === 'bad' ? '#b03021' : 'var(--accent)';
  return (
    <div className="oh-bar-row">
      <div className="oh-bar-label">{label}</div>
      <div className="oh-bar-track">
        <div className="oh-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <div className="oh-bar-caption">{caption} · {pct}%</div>
      <style jsx>{`
        .oh-bar-row {
          display: grid;
          grid-template-columns: 170px 1fr 90px;
          gap: 10px;
          align-items: center;
          padding: 4px 0;
        }
        .oh-bar-label { font-size: 12.5px; color: var(--ink-2); }
        .oh-bar-track { height: 8px; background: var(--paper-2); border-radius: 999px; overflow: hidden; }
        .oh-bar-fill { height: 100%; border-radius: 999px; }
        .oh-bar-caption { font-size: 11px; font-family: 'Geist Mono', monospace; color: var(--ink-3); text-align: right; }
        @media (max-width: 600px) {
          .oh-bar-row { grid-template-columns: 110px 1fr 70px; }
        }
      `}</style>
    </div>
  );
}

function Sparkbars({ data }) {
  if (!data || data.length === 0) return <Empty text="No data in range." />;
  const max = Math.max(...data.map((d) => d.n), 1);
  const PLOT_H = 132; // px — the plotting area height
  const total = data.reduce((s, d) => s + d.n, 0);
  const avg = data.length ? total / data.length : 0;

  return (
    <div className="oh-chart">
      <div className="oh-chart-plot" style={{ height: PLOT_H }}>
        {/* faint average reference line */}
        {avg > 0 && (
          <div
            className="oh-chart-avg"
            style={{ bottom: `${Math.round((avg / max) * PLOT_H)}px` }}
            title={`Average ${avg.toFixed(1)} / week`}
          />
        )}
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.n / max) * PLOT_H));
          return (
            <div key={i} className="oh-chart-col" title={`${d.week}: ${d.n}`}>
              <span className="oh-chart-val">{d.n}</span>
              <div className="oh-chart-bar" style={{ height: `${h}px` }} />
            </div>
          );
        })}
      </div>
      <div className="oh-chart-axis" />
      <div className="oh-chart-labels">
        {data.map((d, i) => (
          <div key={i} className="oh-chart-label">{shortWeek(d.week)}</div>
        ))}
      </div>
      <div className="oh-chart-foot">
        Peak {max}/wk · avg {avg.toFixed(1)}/wk · {total} total
      </div>

      <style jsx>{`
        .oh-chart { width: 100%; }
        .oh-chart-plot {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 14px;
          position: relative;
          padding: 0 4px;
        }
        .oh-chart-avg {
          position: absolute;
          left: 0;
          right: 0;
          border-top: 1px dashed var(--border-strong, #c8bda0);
          pointer-events: none;
        }
        .oh-chart-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          flex: 1 1 0;
          max-width: 46px;
          min-width: 0;
          height: 100%;
        }
        .oh-chart-val {
          font-size: 11px;
          font-family: 'Geist Mono', monospace;
          color: var(--ink-2);
          margin-bottom: 4px;
        }
        .oh-chart-bar {
          width: 100%;
          background: linear-gradient(180deg, var(--accent), rgba(184, 52, 28, 0.78));
          border-radius: 4px 4px 0 0;
          transition: opacity 0.12s;
        }
        .oh-chart-col:hover .oh-chart-bar { opacity: 0.8; }
        .oh-chart-axis {
          height: 2px;
          background: var(--border-strong, #c8bda0);
          border-radius: 1px;
        }
        .oh-chart-labels {
          display: flex;
          justify-content: center;
          gap: 14px;
          padding: 0 4px;
          margin-top: 6px;
        }
        .oh-chart-label {
          flex: 1 1 0;
          max-width: 46px;
          min-width: 0;
          text-align: center;
          font-size: 9.5px;
          color: var(--ink-3);
          white-space: nowrap;
        }
        .oh-chart-foot {
          margin-top: 8px;
          font-size: 11px;
          color: var(--ink-3);
          text-align: center;
        }
      `}</style>
    </div>
  );
}

function RankRow({ rank, name, value }) {
  return (
    <div className="oh-rank-row">
      <span className="r">{rank}</span>
      <span className="n">{name}</span>
      <span className="v">{value}</span>
      <style jsx>{`
        .oh-rank-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 0;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
        }
        .oh-rank-row:last-child { border-bottom: none; }
        .r {
          font-family: 'Geist Mono', monospace;
          font-size: 11px;
          color: var(--ink-3);
          width: 16px;
          flex-shrink: 0;
        }
        .n {
          flex: 1;
          min-width: 0;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v {
          font-family: 'Geist Mono', monospace;
          font-size: 12px;
          color: var(--ink-2);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

function Empty({ text = 'No data.' }) {
  return <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '8px 0' }}>{text}</div>;
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function relative(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

// IST-calendar YYYY-MM-DD helpers for the date-range filter inputs. Computed
// deterministically (Date.now + offset) so SSR and client first-render
// produce the same string — no hydration drift on input values.
function nDaysAgoValue(n) {
  const ms = Date.now() + 5.5 * 3600 * 1000 - n * 86400000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayValue() {
  return nDaysAgoValue(0);
}

// Survey option strings carry a "— description" tail; show only the lead part.
function shortLabel(s) {
  if (!s) return '—';
  const i = s.indexOf('—');
  return (i > 0 ? s.slice(0, i) : s).trim();
}

// '2026-05-04' (week-start date) → '4 May' for the bar-chart x-axis.
function shortWeek(week) {
  const d = new Date(week);
  if (isNaN(d)) return week;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
