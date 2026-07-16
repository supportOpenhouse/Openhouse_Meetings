'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Plus, ChevronRight, Users, MapPin, RefreshCw } from 'lucide-react';
import { initials, BUSINESS_LABELS } from '@/lib/salesFormat';

export default function SalesCpsClient({ initialCps, recentlyAdded }) {
  const [cps, setCps] = useState(initialCps || []);
  const [recentlyAddedList, setRecentlyAddedList] = useState(recentlyAdded || []);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);
  const seq = useRef(0);
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // The partner inventory is cached for a few minutes, so a partner registered
  // seconds ago can be missing. Refresh re-runs the lookup with the cache
  // bypassed (?refresh=1 + no-store).
  async function doRefresh() {
    setRefreshing(true);
    const query = q.trim();
    try {
      if (query) {
        const res = await fetch(`/api/supply/cps?search=${encodeURIComponent(query)}&refresh=1`, {
          cache: 'no-store',
        });
        const data = await res.json();
        setCps(data?.cps ?? []);
      } else {
        // Empty box → refresh the "recently added" list from the external DB
        // (cache-bypassed) and re-pull the rep's recently-visited list.
        const res = await fetch('/api/supply/cps?recent=1&refresh=1', { cache: 'no-store' });
        const data = await res.json();
        setRecentlyAddedList(data?.cps ?? recentlyAddedList);
        router.refresh();
      }
    } catch {
      /* leave the current list in place */
    } finally {
      setRefreshing(false);
    }
  }

  // Empty box → the rep's recently-visited partners (initial list). Typing →
  // debounced search against the shared CP inventory.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const query = q.trim();
    if (!query) {
      setCps(initialCps || []);
      setLoading(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      const mySeq = ++seq.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/supply/cps?search=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (mySeq === seq.current) setCps(data?.cps ?? []);
      } catch {
        if (mySeq === seq.current) setCps([]);
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    }, 220);
    return () => debounce.current && clearTimeout(debounce.current);
  }, [q, initialCps]);

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
            Search the shared partner inventory, or pick up where you left off.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className="oh-btn ghost"
            onClick={doRefresh}
            disabled={refreshing}
            title="Refresh — pull the latest partners (use this if one you just registered is missing)"
            aria-label="Refresh partner list"
          >
            <RefreshCw size={15} className={refreshing ? 'oh-spin' : undefined} />
          </button>
          <Link href="/supply/cps/new" className="oh-btn accent">
            <Plus size={16} /> Register
          </Link>
        </div>
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

      {q.trim() ? (
        cps.length === 0 ? (
          <div className="sx-empty">
            <div className="ico"><Users size={22} /></div>
            <div className="t">No matches</div>
            <div className="s">Try a different name, CP code, or phone.</div>
          </div>
        ) : (
          <div className="sx-list" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            {cps.map((cp) => (
              <CpRow key={cp.id} cp={cp} />
            ))}
          </div>
        )
      ) : (
        <div style={{ opacity: refreshing ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {recentlyAddedList.length > 0 && (
            <>
              <div className="sx-list-label">Recently added</div>
              <div className="sx-list">
                {recentlyAddedList.map((cp) => (
                  <CpRow key={`a-${cp.id}`} cp={cp} showVisits={false} />
                ))}
              </div>
            </>
          )}
          {initialCps.length > 0 && (
            <>
              <div className="sx-list-label">Recently visited</div>
              <div className="sx-list">
                {initialCps.map((cp) => (
                  <CpRow key={`v-${cp.id}`} cp={cp} />
                ))}
              </div>
            </>
          )}
          {recentlyAddedList.length === 0 && initialCps.length === 0 && (
            <div className="sx-empty">
              <div className="ico"><Users size={22} /></div>
              <div className="t">Search the inventory</div>
              <div className="s">Type a partner name, CP code, or phone to find them.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CpRow({ cp, showVisits = true }) {
  const biz = (cp.primary_business || []).map((b) => BUSINESS_LABELS[b] || b).join(' · ');
  const primarySociety = (cp.societies || []).find((s) => s.is_primary) || (cp.societies || [])[0];
  return (
    <Link href={`/supply/cps/${encodeURIComponent(cp.id)}`} className="sx-row">
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
      {showVisits && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{cp.visit_count || 0}</div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {cp.visit_count === 1 ? 'visit' : 'visits'}
          </div>
        </div>
      )}
      <span className="chev">
        <ChevronRight size={18} />
      </span>
    </Link>
  );
}
