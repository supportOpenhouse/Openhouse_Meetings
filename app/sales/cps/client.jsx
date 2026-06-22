'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Plus, ChevronRight, Users, MapPin } from 'lucide-react';
import { initials, BUSINESS_LABELS } from '@/lib/salesFormat';

export default function SalesCpsClient({ initialCps }) {
  const [cps, setCps] = useState(initialCps || []);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);
  const seq = useRef(0);

  // Debounced server search. Empty query falls back to the initial full list.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const mySeq = ++seq.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/sales/cps?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (mySeq === seq.current) setCps(data?.cps ?? []);
      } catch {
        if (mySeq === seq.current) setCps([]);
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    }, 220);
    return () => debounce.current && clearTimeout(debounce.current);
  }, [q]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <h1 className="oh-h1">
            Channel <em>partners</em>
          </h1>
          <p className="oh-sub" style={{ margin: 0 }}>
            The shared registry of brokers you work with.
          </p>
        </div>
        <Link href="/sales/cps/new" className="oh-btn accent" style={{ flexShrink: 0 }}>
          <Plus size={16} /> Register
        </Link>
      </div>

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

      {cps.length === 0 ? (
        <div className="sx-empty">
          <div className="ico">
            <Users size={22} />
          </div>
          <div className="t">{q ? 'No matches' : 'No partners yet'}</div>
          <div className="s">
            {q ? 'Try a different search.' : 'Register your first channel partner to get started.'}
          </div>
        </div>
      ) : (
        <div className="sx-list" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {cps.map((cp) => {
            const biz = (cp.primary_business || [])
              .map((b) => BUSINESS_LABELS[b] || b)
              .join(' · ');
            const primarySociety = (cp.societies || []).find((s) => s.is_primary) ||
              (cp.societies || [])[0];
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
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
