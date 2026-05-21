'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { fmtDate, fmtDuration } from '@/lib/utils';
import WebmAudio from '@/components/WebmAudio';

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
  cross_growth: 'How to increase visits & buyers',
  cross_pipeline: 'Immediate-buyer pipeline read',
};

export default function InsightsClient({ initialData }) {
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState(initialData.period);
  const [tab, setTab] = useState('visit');
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [generating, setGenerating] = useState(null);
  const [genError, setGenError] = useState(null);

  // Ask-anything state
  const [question, setQuestion] = useState('');
  const [askScope, setAskScope] = useState('all');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState(null);

  async function changePeriod(p) {
    setPeriod(p);
    setLoadingPeriod(true);
    try {
      const r = await fetch(`/api/admin/insights?period=${p}`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoadingPeriod(false);
    }
  }

  async function generate(insightKey) {
    setGenerating(insightKey);
    setGenError(null);
    try {
      const r = await fetch('/api/admin/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight_key: insightKey, period }),
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

  async function ask() {
    const q = question.trim();
    if (q.length < 5) return;
    setAsking(true);
    setAskError(null);
    try {
      const r = await fetch('/api/admin/insights/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, scope: askScope, period }),
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
              className={`oh-ins-period ${period === p.value ? 'active' : ''}`}
              onClick={() => changePeriod(p.value)}
              disabled={loadingPeriod}
            >
              {p.label}
            </button>
          ))}
          {loadingPeriod && <Loader2 size={14} className="oh-spin" />}
        </div>
      </div>

      <div className="oh-ins-tabs">
        <TabBtn active={tab === 'visit'} onClick={() => setTab('visit')} icon={Home} label="Visit" />
        <TabBtn active={tab === 'engagement'} onClick={() => setTab('engagement')} icon={Briefcase} label="Engagement" />
        <TabBtn active={tab === 'onboarding'} onClick={() => setTab('onboarding')} icon={Handshake} label="Onboarding" />
        <TabBtn active={tab === 'cross_cut'} onClick={() => setTab('cross_cut')} icon={Target} label="Cross-cut" />
        <TabBtn active={tab === 'ask'} onClick={() => setTab('ask')} icon={Sparkles} label="Ask anything" />
      </div>

      {tab === 'visit' && <VisitTab m={t1.visit} />}
      {tab === 'engagement' && <EngagementTab m={t1.engagement} />}
      {tab === 'onboarding' && <OnboardingTab m={t1.onboarding} />}
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
            />
          ))}
        </div>
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
        .oh-ins-periods { display: flex; gap: 6px; align-items: center; }
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

function InsightCard({ insightKey, title, cached, generating, error, onGenerate }) {
  return (
    <div className="oh-ins-card">
      <div className="oh-ins-card-head">
        <div className="oh-ins-card-title">{title}</div>
        <button className="oh-btn ghost" onClick={onGenerate} disabled={generating}>
          {generating ? <Loader2 size={13} className="oh-spin" /> : <RefreshCw size={13} />}
          {generating ? 'Generating…' : cached ? 'Refresh' : 'Generate'}
        </button>
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

  return (
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
              {ids.length} {ids.length === 1 ? 'recording' : 'recordings'} behind this insight
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
              <div key={m.id} className="oh-mention-row">
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
                {m.audio_url ? (
                  <div style={{ marginTop: 8 }}>
                    <WebmAudio src={m.audio_url} />
                  </div>
                ) : (
                  <div className="oh-mention-noaudio">No audio on file for this meeting.</div>
                )}
              </div>
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
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 11px 13px;
          margin-bottom: 9px;
          background: var(--paper);
        }
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
        .oh-mention-noaudio {
          font-size: 12px;
          color: var(--ink-3);
          font-style: italic;
          margin-top: 8px;
        }
      `}</style>
    </div>
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

// '2026-05-04' (week-start date) → '4 May' for the bar-chart x-axis.
function shortWeek(week) {
  const d = new Date(week);
  if (isNaN(d)) return week;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
