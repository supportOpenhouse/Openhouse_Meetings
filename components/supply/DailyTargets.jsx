'use client';

import { Target } from 'lucide-react';

// Colour the progress bar by how close the rep is to target:
//  green  — at or above target
//  amber  — exactly one below target
//  red    — more than one below
function barColor(value, target) {
  if (value >= target) return 'var(--success)';
  if (value >= target - 1) return 'var(--amber)';
  return 'var(--danger)';
}

function TargetBar({ label, value, target }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const color = barColor(value, target);
  const done = value >= target;
  return (
    <div className="dt-row">
      <div className="dt-head">
        <span className="dt-label">{label}</span>
        <span className="dt-count" style={{ color }}>
          {value}
          <span className="dt-target">/{target}</span>
        </span>
      </div>
      <div className="dt-track">
        <div className="dt-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="dt-note">
        {done
          ? 'Target reached — great work.'
          : `${target - value} more to hit today’s goal.`}
      </div>
    </div>
  );
}

export default function DailyTargets({ targets }) {
  const t = targets || {};
  return (
    <div className="dt-card">
      <div className="dt-card-head">
        <div className="dt-ico">
          <Target size={16} />
        </div>
        <div>
          <div className="dt-title">Daily targets</div>
          <div className="dt-sub">Your goals for today</div>
        </div>
      </div>

      <TargetBar
        label="Meetings today"
        value={t.meetingsToday || 0}
        target={t.meetingTarget || 5}
      />
      <TargetBar
        label="Partners visited today"
        value={t.cpsToday || 0}
        target={t.cpTarget || 5}
      />

      <style jsx>{`
        .dt-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px 18px 16px;
          box-shadow: var(--shadow-sm);
        }
        .dt-card-head {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 16px;
        }
        .dt-ico {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--amber-soft);
          color: var(--amber-2);
          flex-shrink: 0;
        }
        .dt-title {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 16px;
          color: var(--ink);
          line-height: 1.1;
        }
        .dt-sub {
          font-size: 12px;
          color: var(--ink-3);
          margin-top: 2px;
        }
        .dt-row + .dt-row {
          margin-top: 16px;
        }
        .dt-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 7px;
        }
        .dt-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--ink);
        }
        .dt-count {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 18px;
          line-height: 1;
        }
        .dt-target {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink-3);
        }
        .dt-track {
          height: 8px;
          border-radius: 100px;
          background: var(--paper-2);
          overflow: hidden;
        }
        .dt-fill {
          height: 100%;
          border-radius: 100px;
          transition: width 0.4s ease;
        }
        .dt-note {
          font-size: 11.5px;
          color: var(--ink-3);
          margin-top: 6px;
        }
      `}</style>
    </div>
  );
}
