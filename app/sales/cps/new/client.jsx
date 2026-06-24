'use client';

import Link from 'next/link';
import { ArrowLeft, UserPlus, Clock } from 'lucide-react';

// Registration is handled by the main Openhouse system (external) — not wired
// here yet. Partners come from the shared inventory; reps search it and log
// visits against real CP codes. This screen is the "coming soon" placeholder.
export default function SalesCpNewClient() {
  return (
    <div>
      <Link href="/sales/cps" className="sx-back">
        <ArrowLeft size={16} /> Partners
      </Link>

      <div className="sx-empty" style={{ marginTop: 22, padding: '40px 24px' }}>
        <div className="ico">
          <UserPlus size={22} />
        </div>
        <div className="t">Registration is coming soon</div>
        <div className="s" style={{ maxWidth: 420, margin: '0 auto' }}>
          New channel partners will be onboarded through the main Openhouse system. For now, search
          the shared partner inventory and log visits against it.
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 14,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--amber-2)',
            background: 'var(--amber-soft)',
            padding: '6px 12px',
            borderRadius: 100,
          }}
        >
          <Clock size={13} /> Coming soon
        </div>
        <div style={{ marginTop: 18 }}>
          <Link href="/sales/cps" className="oh-btn accent">
            Browse partners
          </Link>
        </div>
      </div>

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
      `}</style>
    </div>
  );
}
