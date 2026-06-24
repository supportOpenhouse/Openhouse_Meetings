'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Sparkles,
  Clock,
  Calendar,
  Package,
  Target,
  MessageSquare,
  Swords,
  ListChecks,
} from 'lucide-react';
import { buildSpeakerTurns } from '@/lib/utils';
import {
  fmtDateTime,
  fmtDuration,
  followupLabel,
  ENGAGEMENT_LABELS,
  OUTCOME_LABELS,
  OUTCOME_PILL,
  STAGE_LABELS,
} from '@/lib/salesFormat';

export default function SalesVisitDetailClient({ initialVisit }) {
  const [visit, setVisit] = useState(initialVisit);
  const pollRef = useRef(null);

  // Poll while the AI pipeline is still running, then stop.
  useEffect(() => {
    if (visit.status !== 'processing') return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/supply/visits/${visit.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.visit && data.visit.status !== 'processing') {
          setVisit(data.visit);
          clearInterval(pollRef.current);
        }
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [visit.status, visit.id]);

  const s = visit.summary || {};
  const turns = buildSpeakerTurns(visit.transcript_words || []);
  const outcomeClass = OUTCOME_PILL[visit.meeting_outcome];

  return (
    <div className="sx-detail">
      <Link href="/supply" className="sx-back">
        <ArrowLeft size={16} /> Home
      </Link>

      <div className="head">
        <h1 className="oh-h1" style={{ fontSize: 30, margin: '8px 0 2px' }}>
          {visit.cp_name || 'Visit'}
        </h1>
        <div className="sub">
          {visit.sales_cp_id ? (
            <Link href={`/supply/cps/${visit.sales_cp_id}`} className="code">
              {visit.cp_code}
            </Link>
          ) : (
            <span className="code">{visit.cp_code}</span>
          )}
          <span className={`sx-pill ${visit.meeting_type === 'repeat_visit' ? 'repeat' : 'first'}`}>
            {visit.meeting_type === 'repeat_visit' ? 'Repeat visit' : 'First visit'}
          </span>
        </div>
        <div className="meta">
          <span>
            <Calendar size={13} /> {fmtDateTime(visit.check_in_time)}
          </span>
          {visit.duration_seconds > 0 && (
            <span>
              <Clock size={13} /> {fmtDuration(visit.duration_seconds)}
            </span>
          )}
        </div>
      </div>

      {/* Status banners */}
      {visit.status === 'processing' && (
        <div className="sx-banner processing">
          <Loader2 size={16} className="oh-spin" />
          <div>
            <strong>Processing…</strong> Transcribing the recording and writing the AI summary. This
            page updates automatically.
          </div>
        </div>
      )}
      {visit.status === 'failed' && (
        <div className="sx-banner failed">
          <AlertCircle size={16} />
          <div>
            <strong>Processing failed.</strong>{' '}
            {visit.error_message || 'The recording could not be transcribed.'} Your logged
            assessment is saved below.
          </div>
        </div>
      )}

      {/* Manual assessment */}
      <section className="sx-section" style={{ marginTop: 20 }}>
        <div className="sx-section-head">
          <h2>Your assessment</h2>
        </div>
        <div className="sx-detail-card">
          <div className="sx-pill-row">
            {visit.cp_engagement_level && (
              <span className={`sx-pill ${visit.cp_engagement_level}`}>
                {ENGAGEMENT_LABELS[visit.cp_engagement_level]}
              </span>
            )}
            {outcomeClass && (
              <span className={`sx-pill ${outcomeClass}`}>
                {OUTCOME_LABELS[visit.meeting_outcome]}
              </span>
            )}
            {visit.inventory_received && (
              <span className="sx-pill onboarded">
                <Package size={11} /> Inventory{' '}
                {visit.inventory_pipeline_count != null ? `· ${visit.inventory_pipeline_count}` : ''}
              </span>
            )}
          </div>

          {visit.key_discussion_points && (
            <Field label="Key discussion points" value={visit.key_discussion_points} />
          )}
          {visit.competitive_update && (
            <Field label="Competitive update" value={visit.competitive_update} />
          )}
          {(visit.next_followup_date || visit.next_action_required) && (
            <div className="sx-followup">
              <Target size={15} />
              <div>
                <div className="lbl">Next step</div>
                <div className="val">
                  {visit.next_action_required || 'Follow up'}
                  {visit.next_followup_date && (
                    <span className="sx-pill follow_up" style={{ marginLeft: 8 }}>
                      {followupLabel(visit.next_followup_date)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* AI summary */}
      {visit.status === 'ready' && s && (
        <section className="sx-section">
          <div className="sx-section-head">
            <h2>
              <Sparkles size={17} style={{ verticalAlign: '-2px', color: 'var(--accent)' }} /> AI
              summary
            </h2>
          </div>
          <div className="sx-ai-card">
            {s.headline && s.headline !== 'Not discussed' && (
              <div className="headline">{s.headline}</div>
            )}
            <div className="sx-pill-row" style={{ marginBottom: 4 }}>
              {s.cp_sentiment && (
                <span className={`sx-pill ${s.cp_sentiment}`}>
                  {ENGAGEMENT_LABELS[s.cp_sentiment] || s.cp_sentiment}
                </span>
              )}
              {s.onboarding_stage && (
                <span className="sx-pill first">{STAGE_LABELS[s.onboarding_stage] || s.onboarding_stage}</span>
              )}
            </div>

            {s.discussion_summary && s.discussion_summary !== 'Not discussed' && (
              <p className="summary">{s.discussion_summary}</p>
            )}

            <BulletBlock icon={<ListChecks size={15} />} title="Key points" items={s.key_points} />
            <BulletBlock icon={<MessageSquare size={15} />} title="CP needs" items={s.cp_needs} />
            <BulletBlock icon={<AlertCircle size={15} />} title="Objections" items={s.objections} />
            <BulletBlock icon={<Target size={15} />} title="Commitments" items={s.commitments} />
            <BulletBlock icon={<ListChecks size={15} />} title="Recommended next steps" items={s.next_steps} />

            {s.competitive_intel && s.competitive_intel !== 'Not discussed' && (
              <Field icon={<Swords size={14} />} label="Competitive intel" value={s.competitive_intel} />
            )}
            {s.inventory_discussion && s.inventory_discussion !== 'Not discussed' && (
              <Field icon={<Package size={14} />} label="Inventory discussion" value={s.inventory_discussion} />
            )}
          </div>
        </section>
      )}

      {/* Transcript */}
      {visit.status === 'ready' && turns.length > 0 && (
        <section className="sx-section">
          <div className="sx-section-head">
            <h2>Transcript</h2>
          </div>
          <div>
            {turns.map((t, i) => (
              <div key={i} className={`oh-speaker s${parseInt(t.speaker.replace(/\D/g, '') || '0', 10) % 3}`}>
                <div className="who">Speaker {(parseInt(t.speaker.replace(/\D/g, '') || '0', 10) % 3) + 1}</div>
                <div className="text">{t.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <style jsx>{`
        .sx-back {
          all: unset;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--accent);
          font-weight: 500;
        }
        .head .sub {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 2px;
        }
        .head .code {
          font-family: var(--font-mono), monospace;
          font-size: 13px;
          color: var(--accent);
          text-decoration: none;
        }
        .head .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 16px;
          margin-top: 10px;
          font-size: 13px;
          color: var(--ink-2);
        }
        .head .meta span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .sx-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 13px 15px;
          border-radius: 12px;
          margin-top: 18px;
          font-size: 13.5px;
          line-height: 1.45;
        }
        .sx-banner.processing {
          background: var(--accent-soft);
          color: var(--accent-2);
        }
        .sx-banner.failed {
          background: var(--danger-soft);
          color: var(--danger);
        }
        .sx-detail-card,
        .sx-ai-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sx-pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .sx-followup {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          color: var(--accent);
        }
        .sx-followup .lbl {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-3);
        }
        .sx-followup .val {
          font-size: 14px;
          color: var(--ink);
          font-weight: 500;
          margin-top: 2px;
        }
        .sx-ai-card .headline {
          font-family: var(--font-sans); font-weight: 700;
          font-size: 22px;
          line-height: 1.2;
          color: var(--ink);
        }
        .sx-ai-card .summary {
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--ink);
          margin: 0;
        }
      `}</style>
    </div>
  );
}

function Field({ icon, label, value }) {
  return (
    <div className="sx-field">
      <div className="lbl">
        {icon} {label}
      </div>
      <div className="val">{value}</div>
      <style jsx>{`
        .sx-field .lbl {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-3);
          font-weight: 500;
          margin-bottom: 5px;
        }
        .sx-field .val {
          font-size: 14px;
          line-height: 1.55;
          color: var(--ink);
          white-space: pre-wrap;
        }
      `}</style>
    </div>
  );
}

function BulletBlock({ icon, title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="sx-bullets">
      <div className="lbl">
        {icon} {title}
      </div>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
      <style jsx>{`
        .sx-bullets .lbl {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-3);
          font-weight: 500;
          margin-bottom: 6px;
        }
        .sx-bullets ul {
          margin: 0;
          padding-left: 18px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .sx-bullets li {
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink);
        }
      `}</style>
    </div>
  );
}
