'use client';

import Link from 'next/link';
import {
  UserPlus,
  Mic,
  Clock,
  TrendingUp,
  Package,
  CalendarClock,
  ChevronDown,
  LifeBuoy,
} from 'lucide-react';

const SECTIONS = [
  {
    Icon: UserPlus,
    title: 'Registering a partner',
    summary: 'Add a broker to the shared registry.',
    body: [
      'Open Partners → Register (or tap Register a partner from Search). Every rep shares the same registry, so check first before adding a duplicate.',
      'Enter the broker’s name and primary phone — those are the only required fields. Add their business type (primary sales, resale, rentals), team size, the societies they work, and their office address.',
      'On save, the partner gets a code like SCP042 automatically. From then on you can find them by name, code, or phone anywhere in the app.',
    ],
    cta: { href: '/supply/cps/new', label: 'Register a partner' },
  },
  {
    Icon: Mic,
    title: 'Logging a visit',
    summary: 'Record on-site, get an AI summary.',
    body: [
      'Tap Log a visit, pick the partner, and start recording when your meeting begins. Keep the phone nearby — clearer audio means a better summary.',
      'When you stop, the recording uploads and goes into processing. You’ll see a Processing pill while our AI transcribes the conversation and pulls out the outcome, engagement level, and any follow-up needed.',
      'Once it’s ready, open the visit to read the summary, key discussion points, and the next action. If something looks off, you can edit the details by hand.',
    ],
    cta: { href: '/supply/visits/new', label: 'Log a visit' },
  },
  {
    Icon: Clock,
    title: 'Clock in / out & the Live Map',
    summary: 'Track your field day in real time.',
    body: [
      'Clock in when you start your day. While clocked in, the app drops periodic location pings so your day is mapped and your time is logged.',
      'The Live Map shows where you’ve been and your active session. Admins use it to see the team in the field — it’s not about surveillance, it’s about crediting your ground work.',
      'Remember to clock out at the end of the day so your session duration is recorded accurately.',
    ],
    cta: { href: '/supply/map', label: 'Open the map' },
  },
  {
    Icon: TrendingUp,
    title: 'Performance',
    summary: 'See your numbers add up.',
    body: [
      'Your Performance view rolls up visits logged today, this week, and all-time, plus partners onboarded and follow-ups due.',
      'Use it to spot momentum and gaps — if onboarded counts are low, revisit your follow-ups. If visits dip, the dashboard nudges you.',
    ],
    cta: { href: '/supply/performance', label: 'View performance' },
  },
  {
    Icon: Package,
    title: 'Inventory',
    summary: 'Capture listings from partners.',
    body: [
      'When a partner shares a flat, add it under Inventory. Pick the partner, then capture the society, configuration, size, price, facing, floor/unit, and furnishing.',
      'Use the OK to visit toggle to flag whether the unit can be shown to buyers. Each listing is stamped with the partner’s code and name so it stays traceable.',
      'Your inventory list shows newest first, so the freshest stock is always on top.',
    ],
    cta: { href: '/supply/inventory', label: 'Manage inventory' },
  },
  {
    Icon: CalendarClock,
    title: 'Follow-ups',
    summary: 'Never let a lead go cold.',
    body: [
      'When a visit needs a follow-up, set the next follow-up date and action. Those surface on your home dashboard under Follow-ups due.',
      'Overdue follow-ups are flagged in red so you can clear them first. Tapping one takes you straight to the partner or the visit.',
      'Closing the loop on follow-ups is the fastest way to move a partner from Evaluating to Onboarded.',
    ],
    cta: { href: '/supply', label: 'See follow-ups' },
  },
];

export default function GuideClient() {
  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 className="oh-h1">
          How it <em>works</em>
        </h1>
        <p className="oh-sub" style={{ margin: 0 }}>
          Everything you need to run your field day, in one place.
        </p>
      </div>

      <div className="guide-list">
        {SECTIONS.map((s, i) => {
          const Icon = s.Icon;
          return (
            <details key={s.title} className="oh-card guide-item" open={i === 0}>
              <summary>
                <span className="g-ico">
                  <Icon size={18} />
                </span>
                <span className="g-text">
                  <span className="g-title">{s.title}</span>
                  <span className="g-summary">{s.summary}</span>
                </span>
                <span className="g-chev">
                  <ChevronDown size={18} />
                </span>
              </summary>
              <div className="g-body">
                {s.body.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
                {s.cta && (
                  <Link href={s.cta.href} className="oh-btn accent" style={{ marginTop: 4 }}>
                    {s.cta.label}
                  </Link>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <div className="guide-help">
        <span className="h-ico">
          <LifeBuoy size={16} />
        </span>
        <span>
          Still stuck? Reach out to your team lead — they can see your visits and follow-ups and
          help you sort things out.
        </span>
      </div>

      <style jsx>{`
        .guide-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .guide-item {
          overflow: hidden;
          padding: 0;
        }
        .guide-item summary {
          list-style: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          user-select: none;
        }
        .guide-item summary::-webkit-details-marker {
          display: none;
        }
        .g-ico {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          background: var(--accent-soft);
          color: var(--accent);
        }
        .g-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          flex: 1;
        }
        .g-title {
          font-weight: 600;
          font-size: 15px;
          color: var(--ink);
        }
        .g-summary {
          font-size: 12.5px;
          color: var(--ink-3);
        }
        .g-chev {
          flex-shrink: 0;
          color: var(--ink-3);
          display: grid;
          place-items: center;
          transition: transform 0.2s;
        }
        .guide-item[open] .g-chev {
          transform: rotate(180deg);
        }
        .guide-item[open] .g-ico {
          background: var(--grad-accent, var(--accent));
          color: #fff;
        }
        .g-body {
          padding: 0 18px 18px 72px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .g-body p {
          margin: 0;
          font-size: 13.5px;
          line-height: 1.6;
          color: var(--ink-2);
        }
        .guide-help {
          margin-top: 18px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 12px;
          background: var(--amber-soft, rgba(245, 158, 11, 0.1));
          border: 1px solid var(--border);
          font-size: 13px;
          line-height: 1.5;
          color: var(--ink-2);
        }
        .h-ico {
          flex-shrink: 0;
          color: var(--amber);
          margin-top: 1px;
        }
        @media (max-width: 560px) {
          .g-body {
            padding-left: 18px;
          }
        }
      `}</style>
    </div>
  );
}
