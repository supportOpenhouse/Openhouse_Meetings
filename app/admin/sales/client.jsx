'use client';

import Link from 'next/link';
import { Users, Building2, TrendingUp, CheckCircle2, Footprints } from 'lucide-react';
import { AdminSalesTabs, StatTile, AdminVisitRow } from '@/components/SalesAdmin';

export default function AdminSalesOverviewClient({ initial }) {
  const { stats, recent } = initial;

  return (
    <div className="oh-sales">
      <AdminSalesTabs current="overview" />

      <h1 className="oh-h1" style={{ fontSize: 36 }}>
        Field <em>sales</em>
      </h1>
      <p className="oh-sub">Team-wide view of reps, visits and the partner pipeline.</p>

      <div className="sx-stats">
        <StatTile icon={<Footprints size={17} />} value={stats.visitsWeek} label="Visits · 7d" />
        <StatTile icon={<TrendingUp size={17} />} tone="amber" value={stats.visitsTotal} label="Visits · all" />
        <StatTile icon={<CheckCircle2 size={17} />} tone="green" value={stats.onboarded} label="Onboarded" />
        <StatTile icon={<Users size={17} />} value={stats.reps} label="Active reps" />
      </div>

      <div className="sx-meta-line">
        <span>
          <strong>{stats.visitsToday}</strong> today
        </span>
        <span>
          <strong>{stats.cps}</strong> partners
        </span>
        <span>
          <strong>{stats.processing}</strong> processing
        </span>
      </div>

      <section className="sx-section">
        <div className="sx-section-head">
          <h2>Recent visits</h2>
          <Link href="/admin/sales/visits">All visits →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="sx-empty">
            <div className="ico">
              <Footprints size={22} />
            </div>
            <div className="t">No visits yet</div>
            <div className="s">Visits logged by the field team will appear here.</div>
          </div>
        ) : (
          <div className="sx-list">
            {recent.map((v) => (
              <AdminVisitRow key={v.id} v={v} />
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .sx-meta-line {
          display: flex;
          flex-wrap: wrap;
          gap: 22px;
          margin-top: 14px;
          font-size: 13px;
          color: var(--ink-2);
        }
        .sx-meta-line strong {
          color: var(--ink);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
