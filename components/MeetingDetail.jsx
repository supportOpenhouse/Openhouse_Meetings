'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Phone,
  Clock,
  Volume2,
  FileText,
  Sparkles,
  Flame,
  TrendingUp,
  Snowflake,
  Trash2,
  User,
  MapPin,
  RefreshCw,
  Loader2,
  Check,
  Minus,
  Briefcase,
  Home,
} from 'lucide-react';
import { fmtDate, fmtDuration, buildSpeakerTurns } from '@/lib/utils';
import { ENGAGEMENT_QUESTIONS, VISIT_QUESTIONS } from './questions';
import { SCORE_PARAMETERS, SCORE_TOTAL_POSSIBLE } from '@/lib/scoring';

export default function MeetingDetail({ meeting, onClose, onDelete, canDelete }) {
  const router = useRouter();
  const [tab, setTab] = useState('engagement');
  const [resumming, setResumming] = useState(false);
  const [resumMsg, setResumMsg] = useState(null);
  const [localMeeting, setLocalMeeting] = useState(meeting);
  const turns = buildSpeakerTurns(localMeeting.transcript_words || []);
  const fallbackText = !turns.length ? localMeeting.transcript_text || '' : '';

  // Normalize the summary into the new shape regardless of when it was saved.
  // Old summaries are a flat object of engagement keys — promote them into
  // the `engagement` slot, leave `visit` empty, and let the UI prompt for
  // regeneration.
  const summary = normalizeSummary(localMeeting.summary);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function resummarize() {
    setResumming(true);
    setResumMsg(null);
    try {
      const r = await fetch(`/api/meetings/${localMeeting.id}/resummarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Re-summarize failed');
      setLocalMeeting((m) => ({ ...m, summary: j.summary }));
      setResumMsg('Summary regenerated.');
      router.refresh();
    } catch (e) {
      setResumMsg('Error: ' + e.message);
    } finally {
      setResumming(false);
    }
  }

  return (
    <div className="oh-modal-bg" onClick={onClose}>
      <div className="oh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="oh-modal-header">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="oh-eyebrow oh-truncate">
              {localMeeting.rm_name || localMeeting.rm_email} · {fmtDate(localMeeting.started_at)}
            </div>
            <h2 className="oh-detail-title">
              CP <span className="oh-mono">{localMeeting.cp_code}</span>
            </h2>
            <div className="oh-detail-meta">
              {localMeeting.cp_name && <span><User size={12} /> {localMeeting.cp_name}</span>}
              <span><Phone size={12} /> {localMeeting.cp_mobile}</span>
              {localMeeting.cp_city && <span><MapPin size={12} /> {localMeeting.cp_city}</span>}
              <span><Clock size={12} /> {fmtDuration(localMeeting.duration_seconds)}</span>
              {localMeeting.language && <span>· {localMeeting.language}</span>}
            </div>
          </div>
          <button className="oh-btn ghost oh-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="oh-modal-body">
          {localMeeting.purpose && (
            <div className="oh-purpose">
              <strong>Purpose:</strong> {localMeeting.purpose}
            </div>
          )}

          {localMeeting.audio_url && (
            <div style={{ marginBottom: 24 }}>
              <div className="oh-eyebrow" style={{ marginBottom: 8 }}>
                <Volume2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                Recording
              </div>
              <WebmAudio src={localMeeting.audio_url} />
            </div>
          )}

          {summary.score && <ScorePanel score={summary.score} />}

          <div className="oh-tabs">
            <TabBtn active={tab === 'engagement'} onClick={() => setTab('engagement')}>
              <Briefcase size={13} /> Engagement summary
            </TabBtn>
            <TabBtn active={tab === 'visit'} onClick={() => setTab('visit')}>
              <Home size={13} /> Visit summary
            </TabBtn>
            <TabBtn active={tab === 'transcript'} onClick={() => setTab('transcript')}>
              <FileText size={13} /> Transcript
            </TabBtn>
          </div>

          {tab === 'engagement' && (
            <SummaryView
              answers={summary.engagement}
              questions={ENGAGEMENT_QUESTIONS}
              emptyHint={
                summary.legacy
                  ? 'This meeting was summarized before the visit/engagement split. Tap "Regenerate" below to refresh both summaries.'
                  : null
              }
            />
          )}
          {tab === 'visit' && (
            <SummaryView
              answers={summary.visit}
              questions={VISIT_QUESTIONS}
              grouped
              emptyHint={
                summary.legacy
                  ? 'No visit summary on file — this meeting predates the visit summary feature. Tap "Regenerate" below.'
                  : null
              }
            />
          )}
          {tab === 'transcript' && (
            <div>
              {turns.length > 0 ? (
                turns.map((t, i) => (
                  <div key={i} className={`oh-speaker s${parseInt(t.speaker.replace(/\D/g, '')) % 3}`}>
                    <div className="who">{t.speaker.replace('speaker_', 'Speaker ')}</div>
                    <div className="text">{t.text}</div>
                  </div>
                ))
              ) : (
                <div className="oh-speaker s0">
                  <div className="text">
                    {fallbackText || (
                      <em style={{ color: 'var(--ink-3)' }}>No transcript available.</em>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab !== 'transcript' && (
            <div className="oh-resum-row">
              <button
                className="oh-btn ghost"
                onClick={resummarize}
                disabled={resumming}
                title="Re-run Claude against the saved transcript to refresh both summaries and the score"
              >
                {resumming ? <Loader2 size={13} className="oh-spin" /> : <RefreshCw size={13} />}
                {resumming ? 'Regenerating…' : 'Regenerate summary'}
              </button>
              {resumMsg && <span className="oh-resum-msg">{resumMsg}</span>}
            </div>
          )}

          {canDelete && (
            <>
              <div className="oh-divider" />
              <div className="oh-delete-row">
                <button className="oh-btn danger" onClick={onDelete}>
                  <Trash2 size={13} /> Delete meeting
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .oh-detail-title {
          font-family: 'Instrument Serif', serif;
          font-size: 28px;
          letter-spacing: -0.01em;
          margin: 4px 0 6px;
        }
        .oh-detail-title :global(.oh-mono) { font-size: 22px; }
        .oh-detail-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 18px;
          font-size: 13px;
          color: var(--ink-2);
        }
        .oh-detail-meta span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .oh-close-btn { padding: 8px; flex-shrink: 0; }
        .oh-truncate {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .oh-purpose {
          background: var(--paper-2);
          padding: 12px 14px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 13.5px;
          color: var(--ink-2);
        }
        .oh-purpose strong { color: var(--ink); }
        .oh-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 18px;
          border-bottom: 1px solid var(--border);
          overflow-x: auto;
        }
        .oh-resum-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px dashed var(--border);
        }
        .oh-resum-msg {
          font-size: 13px;
          color: var(--ink-2);
          background: var(--paper-2);
          padding: 6px 10px;
          border-radius: 6px;
        }
        .oh-delete-row {
          display: flex;
          justify-content: flex-end;
        }
        @media (max-width: 768px) {
          .oh-detail-title { font-size: 22px; }
          .oh-detail-title :global(.oh-mono) { font-size: 18px; }
          .oh-delete-row { justify-content: stretch; }
          .oh-delete-row :global(.oh-btn) { width: 100%; }
        }
      `}</style>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`oh-tab-btn ${active ? 'active' : ''}`}>
      {children}
      <style jsx>{`
        .oh-tab-btn {
          all: unset;
          cursor: pointer;
          padding: 12px 16px;
          font-size: 13.5px;
          color: var(--ink-2);
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: color 0.15s;
          white-space: nowrap;
        }
        .oh-tab-btn.active {
          color: var(--ink);
          border-bottom-color: var(--accent);
          font-weight: 500;
        }
        @media (max-width: 768px) {
          .oh-tab-btn { padding: 14px 12px; font-size: 14px; flex: 1; justify-content: center; }
        }
      `}</style>
    </button>
  );
}

function ScorePanel({ score }) {
  const cls = score.classification || 'cold';
  const Icon = cls === 'hot' ? Flame : cls === 'warm' ? TrendingUp : Snowflake;
  const params = score.parameters || {};
  const ordered = SCORE_PARAMETERS.map((p) => ({
    key: p.key,
    label: p.label,
    points: p.points,
    met: params[p.key]?.met === true,
  }));

  return (
    <div className={`oh-score-panel ${cls}`}>
      <div className="oh-score-head">
        <div>
          <div className="oh-eyebrow"><Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} /> Lead score</div>
          <div className="oh-score-value">
            <span className="num">{score.total}</span>
            <span className="den"> / {score.out_of || SCORE_TOTAL_POSSIBLE}</span>
          </div>
        </div>
        <div className={`oh-score-pill ${cls}`}>
          <Icon size={14} /> {cls.toUpperCase()}
        </div>
      </div>
      <div className="oh-score-grid">
        {ordered.map((p) => (
          <div key={p.key} className={`oh-score-row ${p.met ? 'met' : ''}`}>
            <div className="oh-score-check">
              {p.met ? <Check size={12} /> : <Minus size={12} />}
            </div>
            <div className="oh-score-label">{p.label}</div>
            <div className="oh-score-pts">+{p.points}</div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .oh-score-panel {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--paper);
          padding: 16px 18px;
          margin-bottom: 22px;
        }
        .oh-score-panel.hot { border-color: rgba(184, 52, 28, 0.35); }
        .oh-score-panel.warm { border-color: rgba(196, 122, 26, 0.35); }
        .oh-score-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .oh-score-value {
          font-family: 'Instrument Serif', serif;
          font-size: 32px;
          line-height: 1;
          margin-top: 2px;
        }
        .oh-score-value .den {
          font-size: 16px;
          color: var(--ink-3);
        }
        .oh-score-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.08em;
          border-radius: 999px;
          border: 1.5px solid;
        }
        .oh-score-pill.hot { color: #b8341c; background: rgba(184, 52, 28, 0.08); border-color: rgba(184, 52, 28, 0.35); }
        .oh-score-pill.warm { color: #b97417; background: rgba(196, 122, 26, 0.08); border-color: rgba(196, 122, 26, 0.35); }
        .oh-score-pill.cold { color: #4a6b7a; background: rgba(74, 107, 122, 0.08); border-color: rgba(74, 107, 122, 0.35); }
        .oh-score-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 12px;
        }
        .oh-score-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 13px;
          background: var(--paper-2);
          color: var(--ink-3);
        }
        .oh-score-row.met {
          background: rgba(34, 139, 34, 0.07);
          color: var(--ink);
        }
        .oh-score-check {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--paper);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--ink-3);
          border: 1px solid var(--border);
        }
        .oh-score-row.met .oh-score-check {
          background: #2f6f2f;
          color: #fff;
          border-color: #2f6f2f;
        }
        .oh-score-pts {
          font-family: 'Geist Mono', monospace;
          font-size: 11.5px;
          color: var(--ink-3);
        }
        .oh-score-row.met .oh-score-pts { color: #2f6f2f; font-weight: 600; }
        @media (max-width: 640px) {
          .oh-score-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function SummaryView({ answers, questions, grouped = false, emptyHint = null }) {
  if (!answers || Object.keys(answers).length === 0) {
    return (
      <div style={{ color: 'var(--ink-3)', padding: '12px 0' }}>
        {emptyHint || 'No summary available.'}
      </div>
    );
  }

  const groups = [];
  if (grouped) {
    const byGroup = new Map();
    for (const q of questions) {
      const g = q.group || '__default__';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(q);
    }
    for (const [name, items] of byGroup) {
      groups.push({ name: name === '__default__' ? null : name, items });
    }
  } else {
    groups.push({ name: null, items: questions });
  }

  function renderAnswer(q, val) {
    if (q.list && Array.isArray(val)) {
      if (val.length === 0) return <em style={{ color: 'var(--ink-3)' }}>None</em>;
      return (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {val.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
    }
    return String(val);
  }

  return (
    <div>
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.name && <div className="oh-summary-group-head">{g.name}</div>}
          {g.items.map((q) => {
            const val = answers[q.key];
            if (val === undefined || val === null) return null;
            return (
              <div key={q.key} className="oh-qa-card">
                <div className="q">{q.label}</div>
                <div className="a">{renderAnswer(q, val)}</div>
              </div>
            );
          })}
        </div>
      ))}
      <style jsx>{`
        .oh-summary-group-head {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--ink-3);
          margin: 14px 0 8px;
          padding-bottom: 4px;
          border-bottom: 1px dashed var(--border);
        }
        .oh-summary-group-head:first-of-type { margin-top: 0; }
      `}</style>
    </div>
  );
}

// Recordings produced by MediaRecorder don't have a duration in the WebM
// header, so audio.duration is Infinity until the browser scans the file.
// Trigger that scan on mount: seek to a huge time, wait for durationchange,
// then seek back to 0 — the seek bar now tracks correctly.
function WebmAudio({ src }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    function onMeta() {
      if (cancelled) return;
      if (!isFinite(el.duration)) {
        const onDurationChange = () => {
          if (cancelled) return;
          if (isFinite(el.duration)) {
            el.removeEventListener('durationchange', onDurationChange);
            try { el.currentTime = 0; } catch {}
          }
        };
        el.addEventListener('durationchange', onDurationChange);
        try { el.currentTime = 1e101; } catch {}
      }
    }

    if (el.readyState >= 1) onMeta();
    else el.addEventListener('loadedmetadata', onMeta, { once: true });

    return () => { cancelled = true; };
  }, [src]);

  return (
    <audio
      ref={ref}
      controls
      src={src}
      preload="metadata"
      style={{ width: '100%' }}
    />
  );
}

// Old summaries were flat: { key_topics: ..., cp_requirements: ..., sentiment: ... }.
// New shape: { engagement: {...}, visit: {...}, signals: {...}, score: {...} }.
function normalizeSummary(raw) {
  if (!raw) return { engagement: null, visit: null, score: null, legacy: false };
  if (raw.engagement || raw.visit || raw.score) {
    return {
      engagement: raw.engagement || null,
      visit: raw.visit || null,
      signals: raw.signals || null,
      score: raw.score || null,
      legacy: false,
    };
  }
  // Legacy: treat the whole blob as the engagement answers.
  return { engagement: raw, visit: null, score: null, legacy: true };
}
