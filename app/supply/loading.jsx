// Content-only skeleton. The shell (sidebar, top bar, bottom nav) lives in the
// layout and STAYS put — only this data region shows placeholders while the
// page's server component fetches. We wait for data; nothing else reloads.
export default function SupplyLoading() {
  return (
    <>
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
    </>
  );
}
