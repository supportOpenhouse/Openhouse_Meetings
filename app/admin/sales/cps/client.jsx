'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronRight, Users, MapPin } from 'lucide-react';
import { AdminSalesTabs } from '@/components/SalesAdmin';
import { initials, BUSINESS_LABELS } from '@/lib/salesFormat';

export default function AdminSalesCpsClient({ initialCps }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return initialCps;
    return initialCps.filter(
      (cp) =>
        (cp.cp_name || '').toLowerCase().includes(s) ||
        (cp.cp_id || '').toLowerCase().includes(s) ||
        (cp.phone_primary || '').toLowerCase().includes(s)
    );
  }, [initialCps, q]);

  return (
    <div className="oh-sales">
      <AdminSalesTabs current="cps" />

      <h1 className="oh-h1" style={{ fontSize: 36 }}>
        Partner <em>registry</em>
      </h1>
      <p className="oh-sub">
        {initialCps.length} channel {initialCps.length === 1 ? 'partner' : 'partners'} across the team.
      </p>

      <div className="sx-search" style={{ marginBottom: 16 }}>
        <span className="ico">
          <Search size={16} />
        </span>
        <input
          className="oh-input"
          placeholder="Search by name, code, or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="sx-empty">
          <div className="ico">
            <Users size={22} />
          </div>
          <div className="t">{q ? 'No matches' : 'No partners yet'}</div>
          <div className="s">{q ? 'Try a different search.' : 'Reps register partners from the field.'}</div>
        </div>
      ) : (
        <div className="sx-list">
          {filtered.map((cp) => {
            const biz = (cp.primary_business || []).map((b) => BUSINESS_LABELS[b] || b).join(' · ');
            const primarySociety =
              (cp.societies || []).find((s) => s.is_primary) || (cp.societies || [])[0];
            return (
              <Link key={cp.id} href={`/sales/cps/${cp.id}`} className="sx-row">
                <div className="avatar">{initials(cp.cp_name)}</div>
                <div className="body">
                  <div className="title">{cp.cp_name}</div>
                  <div className="meta">
                    <span className="code">{cp.cp_id}</span>
                    {biz && <span>{biz}</span>}
                    {primarySociety?.society_name && (
                      <span>
                        <MapPin size={11} style={{ verticalAlign: '-1px', marginRight: 2 }} />
                        {primarySociety.society_name}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {cp.visit_count || 0}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--ink-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {cp.visit_count === 1 ? 'visit' : 'visits'}
                  </div>
                </div>
                <span className="chev">
                  <ChevronRight size={18} />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
