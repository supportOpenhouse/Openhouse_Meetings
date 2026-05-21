'use client';

import { useEffect, useState } from 'react';
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
  Handshake,
} from 'lucide-react';
import { fmtDate, fmtDuration, buildSpeakerTurns } from '@/lib/utils';
import { ENGAGEMENT_QUESTIONS, VISIT_QUESTIONS, ONBOARDING_QUESTIONS, MEETING_TYPES } from './questions';
import { SCORE_PARAMETERS, SCORE_TOTAL_POSSIBLE } from '@/lib/scoring';
import WebmAudio from './WebmAudio';

export default function MeetingDetail({ meeting, onClose, onDelete, canDelete }) {
  const router = useRouter();
  const [tab, setTab] = useState('summary');
  const [resumming, setResumming] = useState(false);
  const [resumMsg, setResumMsg] = useState(null);
  const [localMeeting, setLocalMeeting] = useState(meeting);
  const turns = buildSpeakerTurns(localMeeting.transcript_words || []);
  const fallbackText = !turns.length ? localMeeting.transcript_text || '' : '';

  const meetingType = localMeeting.meeting_type || 'engagement';
  const view = pickSummaryView(localMeeting.summary, meetingType);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function resummarize(forceType) {
    setResumming(true);
    setResumMsg(null);
    try {
      const r = await fetch(`/api/meetings/${localMeeting.id}/resummarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forceType ? { meeting_type: forceType } : {}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Re-summarize failed');
      setLocalMeeting((m) => ({ ...m, summary: j.summary, meeting_type: j.meeting_type }));
      setResumMsg(`Regenerated as ${j.meeting_type}.`);
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
              {localMeeting.cp_code ? (
                <>CP <span className="oh-mono">{localMeeting.cp_code}</span></>
              ) : (
                <>{localMeeting.cp_name || 'Prospective CP'}</>
              )}
            </h2>
            <div className="oh-detail-meta">
              {localMeeting.cp_code && localMeeting.cp_name && (
                <span><User size={12} /> {localMeeting.cp_name}</span>
              )}
              {localMeeting.cp_mobile && <span><Phone size={12} /> {localMeeting.cp_mobile}</span>}
              {localMeeting.cp_city && <span><MapPin size={12} /> {localMeeting.cp_city}</span>}
              <span><Clock size={12} /> {fmtDuration(localMeeting.duration_seconds)}</span>
              {localMeeting.language && <span>· {localMeeting.language}</span>}
              <MeetingTypeBadge type={meetingType} />
              {localMeeting.location_lat != null && localMeeting.location_lng != null && (
                <a
                  className="oh-detail-loc"
                  href={`https://www.google.com/maps?q=${localMeeting.location_lat},${localMeeting.location_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={
                    localMeeting.location_accuracy
                      ? `Recorded here — accuracy ±${Math.round(localMeeting.location_accuracy)} m`
                      : 'Recording location'
                  }
                >
                  <MapPin size={12} /> View location
                </a>
              )}
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

          {/* Score panel only renders for visit meetings. Engagement meetings
              use Claude's gut-call sentiment shown inline in the summary. */}
          {meetingType === 'visit' && view.score && <ScorePanel score={view.score} />}

          <div className="oh-tabs">
            <TabBtn active={tab === 'summary'} onClick={() => setTab('summary')}>
              {meetingType === 'visit' && <><Home size={13} /> Visit summary</>}
              {meetingType === 'onboarding' && <><Handshake size={13} /> Onboarding summary</>}
              {meetingType === 'engagement' && <><Briefcase size={13} /> Engagement summary</>}
            </TabBtn>
            <TabBtn active={tab === 'transcript'} onClick={() => setTab('transcript')}>
              <FileText size={13} /> Transcript
            </TabBtn>
          </div>

          {tab === 'summary' && (
            <SummaryView
              answers={view.answers}
              questions={
                meetingType === 'visit'
                  ? VISIT_QUESTIONS
                  : meetingType === 'onboarding'
                  ? ONBOARDING_QUESTIONS
                  : ENGAGEMENT_QUESTIONS
              }
              grouped={meetingType === 'visit'}
              emptyHint={
                view.missing
                  ? `No ${meetingType} summary on file — this meeting predates the current logic. Tap "Regenerate" below.`
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

          {tab === 'summary' && (
            <div className="oh-resum-row">
              <button
                className="oh-btn ghost"
                onClick={() => resummarize(null)}
                disabled={resumming}
                title="Re-run Claude against the saved transcript using the current meeting type"
              >
                {resumming ? <Loader2 size={13} className="oh-spin" /> : <RefreshCw size={13} />}
                {resumming ? 'Regenerating…' : 'Regenerate'}
              </button>
              <span className="oh-resum-label">Or reclassify as:</span>
              {MEETING_TYPES.filter((t) => t.value !== meetingType).map((t) => (
                <button
                  key={t.value}
                  className="oh-btn ghost"
                  onClick={() => resummarize(t.value)}
                  disabled={resumming}
                >
                  {t.label}
                </button>
              ))}
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
        .oh-detail-loc {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--accent);
          text-decoration: none;
          border-bottom: 1px dashed currentColor;
        }
        .oh-detail-loc:hover { opacity: 0.75; }
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
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px dashed var(--border);
        }
        .oh-resum-label {
          font-size: 12px;
          color: var(--ink-3);
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

function MeetingTypeBadge({ type }) {
  const meta = {
    visit:       { Icon: Home,      label: 'visit',       cls: 'visit' },
    onboarding:  { Icon: Handshake, label: 'onboarding',  cls: 'onboarding' },
    engagement:  { Icon: Briefcase, label: 'engagement',  cls: 'engagement' },
  }[type] || { Icon: Briefcase, label: 'engagement', cls: 'engagement' };
  const Icon = meta.Icon;
  return (
    <span className={`oh-type-badge ${meta.cls}`}>
      <Icon size={11} /> {meta.label}
      <style jsx>{`
        .oh-type-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid;
          font-weight: 500;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .oh-type-badge.engagement {
          color: #4a6b7a;
          background: rgba(74, 107, 122, 0.08);
          border-color: rgba(74, 107, 122, 0.25);
        }
        .oh-type-badge.visit {
          color: #b97417;
          background: rgba(196, 122, 26, 0.08);
          border-color: rgba(196, 122, 26, 0.25);
        }
        .oh-type-badge.onboarding {
          color: #6b46a3;
          background: rgba(107, 70, 163, 0.08);
          border-color: rgba(107, 70, 163, 0.25);
        }
      `}</style>
    </span>
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
    if (q.sentiment) {
      return (
        <span
          className={`oh-pill ${val === 'hot' ? 'hot' : val === 'warm' ? 'warm' : 'cold'}`}
          style={{ fontSize: 13, padding: '4px 12px' }}
        >
          {val === 'hot' && <Flame size={12} />}
          {val === 'warm' && <TrendingUp size={12} />}
          {val === 'cold' && <Snowflake size={12} />}
          {val}
        </span>
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

// Given the saved `summary` JSONB and the chosen meeting_type, return the
// right answer set + score (visits only) for the active tab.
// Tolerates THREE historical shapes:
//   1. Flat (very old): { key_topics: ..., sentiment: 'warm', ... }
//   2. Combined (the 50 we resummarized): { engagement, visit, signals, score }
//   3. Branched (current): { meeting_type, engagement } or { meeting_type, visit, signals, score }
function pickSummaryView(summary, meetingType) {
  if (!summary) return { answers: null, score: null, missing: true };

  if (meetingType === 'visit') {
    if (summary.visit) {
      return { answers: summary.visit, score: summary.score || null, missing: false };
    }
    return { answers: null, score: null, missing: true };
  }

  if (meetingType === 'onboarding') {
    if (summary.onboarding) {
      return { answers: summary.onboarding, score: null, missing: false };
    }
    return { answers: null, score: null, missing: true };
  }

  // engagement view
  if (summary.engagement) {
    return { answers: summary.engagement, score: null, missing: false };
  }
  // Flat shape — treat the whole blob as engagement answers.
  return { answers: summary, score: null, missing: false };
}
