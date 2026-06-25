// Active-nav matching from the pathname (so the shell can live in a layout and
// derive the highlight itself instead of each page passing `current`).
export function isNavActive(href, pathname) {
  if (!pathname || !href) return false;
  // Home roots ('/supply', '/dashboard', '/admin') match only exactly, so a
  // sub-route doesn't also light up Home.
  const isRoot = href.split('/').filter(Boolean).length <= 1;
  if (isRoot) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Of all nav hrefs, the single best (longest) match for the pathname — so a
// parent like '/admin/supply' (Overview) doesn't stay highlighted on a child
// route like '/admin/supply/insights'. Only the deepest match wins.
export function activeHref(hrefs, pathname) {
  let best = null;
  for (const href of hrefs) {
    if (isNavActive(href, pathname) && (!best || href.length > best.length)) best = href;
  }
  return best;
}
