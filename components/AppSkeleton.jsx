import Logo from '@/components/Logo';

// Instant loading chrome for the demand/admin/direct routes — mirrors the
// AppShell layout so clicking a nav item shows a skeleton immediately instead
// of freezing on the old page while the server component fetches. (Same idea as
// app/supply/loading.jsx, which is why the old side felt sluggish without it.)
export default function AppSkeleton() {
  return (
    <div className="oh-shell oh-sales">
      <aside className="oh-side">
        <div className="oh-brand">
          <Logo />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
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
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sx-skel sx-skel-row" />
          ))}
        </div>
      </main>
    </div>
  );
}
