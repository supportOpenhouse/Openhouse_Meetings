import { Plus } from 'lucide-react';

// Per-page loading chrome. The static structure (hero, headings, section titles,
// card outlines, labels) renders for real; only the DATA regions shimmer. So a
// navigating user sees the page take shape immediately and just waits on data.
//
// `kind` picks the content layout; the shell (sidebar/top bar/bottom nav) is
// already provided by app/supply/layout.jsx and never reloads.

function Line({ w = '100%', h = 12, r = 6, style }) {
  return <span className="sx-skel" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

function StatTiles({ labels }) {
  return (
    <div className="sx-skel-stats" style={{ marginTop: 20 }}>
      {labels.map((l) => (
        <div key={l} className="oh-card" style={{ padding: 16, borderRadius: 16 }}>
          <span className="sx-skel" style={{ display: 'block', width: 34, height: 34, borderRadius: 11 }} />
          <Line w="46%" h={22} style={{ marginTop: 12 }} />
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', fontWeight: 600, marginTop: 8 }}>
            {l}
          </div>
        </div>
      ))}
    </div>
  );
}

function Rows({ n = 5 }) {
  return (
    <div className="sx-list" style={{ marginTop: 12 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="sx-row" style={{ pointerEvents: 'none' }}>
          <span className="sx-skel" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0 }} />
          <div className="body" style={{ flex: 1 }}>
            <Line w="55%" h={13} />
            <Line w="35%" h={11} style={{ marginTop: 7 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SupplyLoading({ title, sub, kind = 'plain' }) {
  if (kind === 'dashboard') {
    // Home: real hero gradient + the "Log a visit" CTA, only the greeting + stats shimmer.
    return (
      <div>
        <section className="sx-hero">
          <div className="eyebrow">Supply</div>
          <Line w="62%" h={26} style={{ background: 'rgba(255,255,255,0.35)', margin: '8px 0' }} />
          <Line w="80%" h={13} style={{ background: 'rgba(255,255,255,0.25)' }} />
          <span className="sx-hero-cta" style={{ marginTop: 16, opacity: 0.9 }}>
            <Plus size={18} /> Log a visit
          </span>
        </section>
        <StatTiles labels={["Today's visits", 'This week', 'All visits', 'Partners']} />
        <div className="oh-card" style={{ marginTop: 20, padding: 18, borderRadius: 16 }}>
          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>Daily targets</div>
          <Line w="40%" h={11} style={{ marginTop: 6 }} />
          <Line w="100%" h={9} style={{ marginTop: 14 }} />
          <Line w="100%" h={9} style={{ marginTop: 14 }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {title && (
        <div style={{ marginBottom: 16 }}>
          <h1 className="oh-h1">{title}</h1>
          {sub && <p className="oh-sub" style={{ margin: 0 }}>{sub}</p>}
        </div>
      )}

      {kind === 'insights' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {['Last 30 days', 'Last 90 days', 'All time'].map((p) => (
              <span key={p} style={{ fontSize: 12.5, padding: '6px 13px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--ink-3)' }}>{p}</span>
            ))}
          </div>
          <StatTiles labels={['Visits', 'Onboarded', 'Inventory', 'Active reps', 'Avg visit']} />
        </>
      )}

      {kind === 'search' && <Line w="100%" h={46} r={12} style={{ marginBottom: 18 }} />}

      {(kind === 'list' || kind === 'search') && <Rows n={6} />}

      {kind === 'plain' && (
        <div className="oh-card" style={{ padding: 20, borderRadius: 16 }}>
          <Line w="70%" h={14} />
          <Line w="100%" h={11} style={{ marginTop: 14 }} />
          <Line w="90%" h={11} style={{ marginTop: 10 }} />
          <Line w="95%" h={11} style={{ marginTop: 10 }} />
        </div>
      )}
    </div>
  );
}
