'use client';

// Mobile bottom bar + slide-in drawer ("sidebar"). The bar holds only the few
// primary CTAs (+ optional central FAB) with small labels; everything else lives
// in the drawer opened via the Menu button — so the bar never gets cramped or
// cryptic. Used by AppShell (admin/demand/direct) and SalesShell.
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BarChart3, Footprints, Building2, Users, UserCog,
  Cloud, Activity, Plus, Upload, LogOut, Menu as MenuIcon, X, MapPin,
  Search, ClipboardList, BookOpen, Home,
} from 'lucide-react';

// Icons are resolved by name so the (server) shells can pass plain serializable
// nav data across the client boundary.
const ICONS = {
  LayoutDashboard, BarChart3, Footprints, Building2, Users, UserCog,
  Cloud, Activity, Plus, Upload, MapPin, Search, ClipboardList, BookOpen, Home,
};

function BarItem({ it, active }) {
  const Icon = ICONS[it.iconName] || LayoutDashboard;
  return (
    <Link href={it.href} aria-label={it.label} className={`item ${active ? 'active' : ''}`}>
      <Icon size={21} />
      <span>{it.label}</span>
    </Link>
  );
}

export default function MobileNav({ items, current, user, roleLabel, signOutAction, fab }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const primary = items.filter((i) => i.primary).slice(0, 3);
  const menuBtn = (
    <button
      type="button"
      className="item"
      aria-label="Open menu"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      <MenuIcon size={21} />
      <span>Menu</span>
    </button>
  );

  return (
    <>
      <nav className="oh-mobile-bottom" aria-label="Primary">
        {fab ? (
          <>
            {primary.slice(0, 2).map((it) => (
              <BarItem key={it.key} it={it} active={current === it.key} />
            ))}
            <div className="oh-fab-wrap">
              <Link href={fab.href} className="oh-fab" aria-label={fab.label}>
                <Plus size={26} />
              </Link>
            </div>
            {primary.slice(2).map((it) => (
              <BarItem key={it.key} it={it} active={current === it.key} />
            ))}
            {menuBtn}
          </>
        ) : (
          <>
            {primary.map((it) => (
              <BarItem key={it.key} it={it} active={current === it.key} />
            ))}
            {menuBtn}
          </>
        )}
      </nav>

      {open && (
        <button
          type="button"
          className="oh-drawer-scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={`oh-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="oh-drawer-head">
          {user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="oh-drawer-avatar" src={user.image} alt="" />
          ) : (
            <div className="oh-drawer-avatar fallback">
              {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="oh-drawer-meta">
            <div className="nm">{user?.name || user?.email}</div>
            {roleLabel && <div className="rl">{roleLabel}</div>}
          </div>
          <button type="button" className="oh-drawer-x" aria-label="Close" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="oh-drawer-nav">
          {items.map((it) => {
            const Icon = ICONS[it.iconName] || LayoutDashboard;
            return (
              <Link
                key={it.key}
                href={it.href}
                className={`oh-drawer-item ${current === it.key ? 'active' : ''}`}
                onClick={() => setOpen(false)}
              >
                <Icon size={18} /> {it.label}
              </Link>
            );
          })}
        </nav>

        {signOutAction && (
          <form action={signOutAction} className="oh-drawer-foot">
            <button type="submit" className="oh-drawer-item signout">
              <LogOut size={18} /> Sign out
            </button>
          </form>
        )}
      </aside>
    </>
  );
}
