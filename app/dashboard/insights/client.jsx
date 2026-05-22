'use client';

import { useState } from 'react';
import { Sparkles, RefreshCw, Loader2, Target, AlertCircle } from 'lucide-react';

const CARDS = [
  { key: 'cross_growth', title: 'How to increase visits & buyers' },
  { key: 'cross_pipeline', title: 'Immediate-buyer pipeline read' },
];

// RM cross-cut insights — same shape as the admin cross-cut tab, but every
// number is scoped to this RM's assigned CPs.
export default function RmInsightsClient({ initial, user }) {
  const [standard, setStandard] = useState(initial.standard || {});
  const [cpFocus] = useState(initial.cpFocus || []);
  const [generating, setGenerating] = useState(null);
  const [error, setError] = useState(null);

  async function generate(insightKey) {
    setGenerating(insightKey);
    setError(null);
    try {
      const r = await fetch('/api/insights/crosscut/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight_key: insightKey, period: 90 }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Generation failed');
      setStandard((s) => ({ ...s, [insightKey]: j.insight }));
    } catch (e) {
      setError({ key: insightKey, message: e.message });
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="oh-page" style={{ maxWidth: 900 }}>
      <div className="oh-eyebrow">Openhouse · {user.name}</div>
      <h1 className="oh-h1">
        My <em>insights</em>
      </h1>
      <p className="oh-sub">
        Cross-cut insights across <strong>your assigned CPs</strong> — who needs attention, and
        how to grow visits and buyers. The AI cards are generated on demand.
      </p>

      <div className="oh-rmi-section">
        <div className="oh-rmi-head">
          <Target size={14} /> CPs to focus on now
        </div>
        <div className="oh-rmi-panel">
          {cpFocus.length === 0 && (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '6px 0' }}>
              None of your CPs show a month-on-month drop in recorded visits. 👍
            </div>
          )}
          {cpFocus.map((c) => (
            <div key={c.cp_code} className="oh-rmi-focus">
              <div style={{ minWidth: 0 }}>
                <span className="oh-mono" style={{ fontWeight: 600 }}>{c.cp_code}</span>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{c.reason}</div>
              </div>
              <div className="oh-rmi-drop">−{c.drop}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="oh-rmi-head" style={{ marginTop: 26 }}>
        <Sparkles size={14} /> AI insights — generated on demand
      </div>
      {CARDS.map((card) => {
        const cached = standard[card.key];
        const busy = generating === card.key;
        const err = error?.key === card.key ? error.message : null;
        return (
          <div key={card.key} className="oh-rmi-card">
            <div className="oh-rmi-card-head">
              <div className="oh-rmi-card-title">{card.title}</div>
              <button className="oh-btn ghost" onClick={() => generate(card.key)} disabled={busy}>
                {busy ? <Loader2 size={13} className="oh-spin" /> : <RefreshCw size={13} />}
                {busy ? 'Generating…' : cached ? 'Refresh' : 'Generate'}
              </button>
            </div>
            {err && (
              <div className="oh-rmi-err">
                <AlertCircle size={13} /> {err}
              </div>
            )}
            {!cached && !busy && !err && (
              <div className="oh-rmi-empty">
                Not generated yet. Tap Generate — one AI pass over your CPs&rsquo; meetings.
              </div>
            )}
            {cached && <ResultBody result={cached.result} meta={cached} />}
          </div>
        );
      })}

      <style jsx>{`
        .oh-rmi-section { margin-top: 18px; }
        .oh-rmi-head {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-3);
          font-weight: 600;
          margin-bottom: 10px;
        }
        .oh-rmi-panel {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 8px 16px;
        }
        .oh-rmi-focus {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 9px 0;
          border-bottom: 1px solid var(--border);
        }
        .oh-rmi-focus:last-child { border-bottom: none; }
        .oh-rmi-drop {
          font-family: 'Geist Mono', monospace;
          font-weight: 600;
          color: var(--danger, #b03021);
          font-size: 14px;
          flex-shrink: 0;
        }
        .oh-rmi-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 10px;
        }
        .oh-rmi-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .oh-rmi-card-title { font-weight: 600; font-size: 14.5px; color: var(--ink); }
        .oh-rmi-empty {
          margin-top: 10px;
          font-size: 13px;
          color: var(--ink-3);
          background: var(--paper-2);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .oh-rmi-err {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--danger, #b03021);
          font-size: 13px;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}

function ResultBody({ result, meta }) {
  if (!result) return null;
  return (
    <div className="oh-rmi-body">
      {result.headline && <div className="oh-rmi-headline">{result.headline}</div>}
      {Array.isArray(result.items) && result.items.length > 0 && (
        <div>
          {result.items.map((it, i) => (
            <div key={i} className="oh-rmi-item">
              <span className="oh-rmi-rank">{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="oh-rmi-item-top">
                  <span className="oh-rmi-item-label">{it.label}</span>
                  {it.value && <span className="oh-rmi-item-value">{it.value}</span>}
                </div>
                {it.note && <div className="oh-rmi-item-note">{it.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {result.narrative && <div className="oh-rmi-narrative">{result.narrative}</div>}
      {meta && (
        <div className="oh-rmi-meta">
          {meta.meeting_count} meetings · generated {relative(meta.generated_at)}
        </div>
      )}
      <style jsx>{`
        .oh-rmi-body { margin-top: 10px; }
        .oh-rmi-headline {
          font-family: 'Instrument Serif', serif;
          font-size: 19px;
          line-height: 1.3;
          color: var(--ink);
          margin-bottom: 10px;
        }
        .oh-rmi-item {
          display: flex;
          gap: 10px;
          padding: 7px 0;
          border-bottom: 1px solid var(--border);
        }
        .oh-rmi-item:last-of-type { border-bottom: none; }
        .oh-rmi-rank {
          font-family: 'Geist Mono', monospace;
          font-size: 11px;
          color: var(--ink-3);
          width: 16px;
          flex-shrink: 0;
          padding-top: 1px;
        }
        .oh-rmi-item-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: baseline;
        }
        .oh-rmi-item-label { font-weight: 500; font-size: 13.5px; color: var(--ink); }
        .oh-rmi-item-value {
          font-family: 'Geist Mono', monospace;
          font-size: 11.5px;
          color: var(--accent);
          flex-shrink: 0;
        }
        .oh-rmi-item-note { font-size: 12.5px; color: var(--ink-2); margin-top: 2px; }
        .oh-rmi-narrative {
          font-size: 13.5px;
          color: var(--ink-2);
          line-height: 1.55;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px dashed var(--border);
        }
        .oh-rmi-meta { font-size: 11.5px; color: var(--ink-3); margin-top: 10px; }
      `}</style>
    </div>
  );
}

function relative(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}
