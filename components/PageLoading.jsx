// Content-only loading chrome for the demand / admin / direct routes. The shell
// (sidebar, top bar, bottom nav) now lives in the route-group layout and stays
// mounted, so a page's loading.jsx renders ONLY its content area: the real
// heading + sub render immediately and just the DATA regions shimmer.

function Line({ w = '100%', h = 12, r = 6, style }) {
  return <span className="sx-skel" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

function Tiles({ n = 4 }) {
  return (
    <div className="sx-skel-stats" style={{ marginTop: 18 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="oh-card" style={{ padding: 16, borderRadius: 16 }}>
          <Line w="42%" h={11} />
          <Line w="56%" h={24} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

function Rows({ n = 6 }) {
  return (
    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="oh-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14 }}>
          <span className="sx-skel" style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <Line w="50%" h={13} />
            <Line w="30%" h={11} style={{ marginTop: 7 }} />
          </div>
          <Line w={56} h={22} r={999} />
        </div>
      ))}
    </div>
  );
}

export default function PageLoading({ title, sub, kind = 'list' }) {
  return (
    <div>
      {title && (
        <div style={{ marginBottom: 16 }}>
          <h1 className="oh-h1">{title}</h1>
          {sub && <p className="oh-sub" style={{ margin: 0 }}>{sub}</p>}
        </div>
      )}

      {kind === 'insights' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {['Last 30 days', 'Last 90 days', 'All time'].map((p) => (
            <span key={p} style={{ fontSize: 12.5, padding: '6px 13px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--ink-3)' }}>{p}</span>
          ))}
        </div>
      )}

      {(kind === 'dashboard' || kind === 'insights') && <Tiles n={4} />}

      {kind === 'search' && <Line w="100%" h={46} r={12} style={{ marginBottom: 18 }} />}

      {kind !== 'plain' && <Rows n={6} />}

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
