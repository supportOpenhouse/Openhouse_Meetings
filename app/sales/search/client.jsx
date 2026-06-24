'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Phone,
  Hash,
  User,
  Users,
  ChevronRight,
  MapPin,
  Plus,
} from 'lucide-react';
import { initials, BUSINESS_LABELS } from '@/lib/salesFormat';

// Detect what the rep is searching for from the raw query.
function detectType(q) {
  const s = (q || '').trim();
  if (!s) return 'name';
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10 && /^\d[\d\s+-]*$/.test(s)) return 'phone';
  if (/^(scp|cp)/i.test(s)) return 'code';
  return 'name';
}

const TYPE_META = {
  phone: { Icon: Phone, label: 'Phone' },
  code: { Icon: Hash, label: 'Code' },
  name: { Icon: User, label: 'Name' },
};

const BIZ_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'primary', label: 'Primary sales' },
  { key: 'resale', label: 'Resale' },
  { key: 'rental', label: 'Rentals' },
];

export default function SearchClient() {
  const [q, setQ] = useState('');
  const [biz, setBiz] = useState('all');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounce = useRef(null);
  const seq = useRef(0);

  const type = detectType(q);
  const { Icon } = TYPE_META[type];

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      const mySeq = ++seq.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/sales/cps?search=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        if (mySeq === seq.current) {
          setResults(data?.cps ?? []);
          setSearched(true);
        }
      } catch {
        if (mySeq === seq.current) {
          setResults([]);
          setSearched(true);
        }
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    }, 220);
    return () => debounce.current && clearTimeout(debounce.current);
  }, [q]);

  // Partners come from the shared inventory, which doesn't carry a business
  // type, so results are shown as-is.
  const filtered = results;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="oh-h1">
          Find a <em>partner</em>
        </h1>
        <p className="oh-sub" style={{ margin: 0 }}>
          Search by name, partner code, or phone number.
        </p>
      </div>

      <div className="sx-search" style={{ marginBottom: 14 }}>
        <span className="ico">
          <Icon size={16} />
        </span>
        <input
          className="oh-input"
          placeholder="Name, SCP code, or 10-digit phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {q.trim() && (
          <span className="type-hint">
            {TYPE_META[type].label}
          </span>
        )}
      </div>

      {!searched && !loading ? (
        <div className="sx-empty">
          <div className="ico">
            <Search size={22} />
          </div>
          <div className="t">Start typing to search</div>
          <div className="s">We’ll detect whether it’s a name, code, or phone.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="sx-empty">
          <div className="ico">
            <Users size={22} />
          </div>
          <div className="t">No matches</div>
          <div className="s">No partner fits that search. Want to add them?</div>
          <Link href="/sales/cps/new" className="oh-btn accent" style={{ marginTop: 14 }}>
            <Plus size={16} /> Register a partner
          </Link>
        </div>
      ) : (
        <div className="sx-list" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {filtered.map((cp) => {
            const labels = (cp.primary_business || [])
              .map((b) => BUSINESS_LABELS[b] || b)
              .join(' · ');
            const primarySociety =
              (cp.societies || []).find((s) => s.is_primary) || (cp.societies || [])[0];
            return (
              <Link key={cp.id} href={`/sales/cps/${encodeURIComponent(cp.id)}`} className="sx-row">
                <div className="avatar">{initials(cp.cp_name)}</div>
                <div className="body">
                  <div className="title">{cp.cp_name}</div>
                  <div className="meta">
                    <span className="code">{cp.cp_id}</span>
                    {cp.phone_primary && (
                      <span>
                        <Phone size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />
                        {cp.phone_primary}
                      </span>
                    )}
                    {labels && <span>{labels}</span>}
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

      <style jsx>{`
        .type-hint {
          flex-shrink: 0;
          font-size: 10.5px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--accent);
          background: var(--accent-soft);
          padding: 4px 9px;
          border-radius: 100px;
        }
      `}</style>
    </div>
  );
}
