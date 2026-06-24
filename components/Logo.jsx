// The Openhouse lockup (icon + wordmark). The source PNG is light/cream — built
// for dark backgrounds — so CSS darkens it on light surfaces (see .oh-logo in
// globals.css) and leaves it native on the dark login panel.
export default function Logo({ className = '', alt = 'Openhouse', style }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo_2.png" alt={alt} className={`oh-logo ${className}`} style={style} />;
}
