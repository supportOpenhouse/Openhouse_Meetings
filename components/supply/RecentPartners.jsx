'use client';

import Link from 'next/link';
import { Phone, Eye, Plus } from 'lucide-react';
import { initials } from '@/lib/salesFormat';

// FCP-style channel-partner cards: gradient square icon with initials, name,
// mono cp_code, phone, and a "View" ghost button + amber "Log visit" button.
export default function RecentPartners({ cps }) {
  const list = cps || [];
  if (list.length === 0) return null;

  return (
    <div className="rp-grid">
      {list.map((cp) => (
        <div key={cp.id} className="rp-card">
          <div className="rp-top">
            <div className="rp-ico">{initials(cp.cp_name)}</div>
            <div className="rp-id">
              <div className="rp-name">{cp.cp_name || 'Channel partner'}</div>
              {cp.cp_id && <div className="rp-code">{cp.cp_id}</div>}
            </div>
          </div>

          {cp.phone_primary && (
            <div className="rp-phone">
              <Phone size={13} />
              <span>{cp.phone_primary}</span>
            </div>
          )}

          <div className="rp-actions">
            <Link href={`/supply/cps/${encodeURIComponent(cp.id)}`} className="oh-btn ghost rp-btn">
              <Eye size={15} /> View
            </Link>
            <Link href={`/supply/visits/new?cp=${encodeURIComponent(cp.id)}`} className="oh-btn amber rp-btn">
              <Plus size={15} /> Log visit
            </Link>
          </div>
        </div>
      ))}

      <style jsx>{`
        .rp-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .rp-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: var(--shadow-sm);
          transition: box-shadow 0.15s, transform 0.15s;
        }
        .rp-card:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }
        .rp-top {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }
        .rp-ico {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--grad-primary);
          color: #fff;
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 19px;
          box-shadow: var(--shadow-glow);
        }
        .rp-id {
          min-width: 0;
        }
        .rp-name {
          font-size: 14.5px;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .rp-code {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          color: var(--accent);
          margin-top: 2px;
        }
        .rp-phone {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          color: var(--ink-2);
        }
        .rp-phone :global(svg) {
          color: var(--ink-3);
          flex-shrink: 0;
        }
        .rp-actions {
          display: flex;
          gap: 8px;
          margin-top: auto;
        }
        .rp-btn {
          flex: 1;
          padding: 9px 10px;
          font-size: 12.5px;
        }
      `}</style>
    </div>
  );
}
