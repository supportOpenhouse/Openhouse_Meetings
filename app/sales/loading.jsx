// Shown instantly on navigation to any /sales route while the server component
// fetches — so clicks feel responsive instead of frozen. Mirrors the SalesShell
// chrome so there's no shell-less flash.
export default function SalesLoading() {
  return (
    <div className="oh-sales">
      <div className="oh-shell">
        <aside className="oh-side">
          <div className="oh-brand">
            Open<span>house</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="sx-skel sx-skel-nav" />
            ))}
          </div>
        </aside>

        <main className="oh-main">
          <div className="sx-skel sx-skel-hero" />
          <div className="sx-skel-stats">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="sx-skel sx-skel-tile" />
            ))}
          </div>
          <div className="sx-skel-rows">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="sx-skel sx-skel-row" />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
