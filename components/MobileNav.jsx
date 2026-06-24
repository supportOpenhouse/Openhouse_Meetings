'use client';

// Mobile chrome: a fixed top bar (logo + avatar both open the drawer), a fixed
// bottom bar (a few primary CTAs + optional central FAB + Menu), and the slide-in
// drawer with the full nav. All fixed + self-contained, so it stays put while the
// page content loads. Used by SalesShell (supply) and AppShell (admin/demand).
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BarChart3, Footprints, Building2, Users, UserCog,
  Cloud, Activity, Plus, Upload, LogOut, Menu as MenuIcon, X, MapPin,
  Search, ClipboardList, BookOpen, Home,
} from 'lucide-react';
import Logo from './Logo';
import { isNavActive } from '@/lib/navActive';

// Icons resolved by name so the shells can pass plain serializable nav data.
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

export default function MobileNav({ items, user, roleLabel, signOutAction, fab, sectionSwitch }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const active = (href) => isNavActive(href, pathname);

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

  const avatar = user?.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="oh-drawer-avatar" src={user.image} alt="" />
  ) : (
    <div className="oh-drawer-avatar fallback">
      {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
    </div>
  );

  return (
    <>
      {/* Fixed top bar — logo + avatar both open the drawer */}
      <header className="oh-mobile-top">
        <button
          type="button"
          className="oh-mtop-btn"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Logo />
        </button>
        <button
          type="button"
          className="oh-mtop-avatar"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          {avatar}
        </button>
      </header>

      {/* Fixed bottom bar */}
      <nav className="oh-mobile-bottom" aria-label="Primary">
        {fab ? (
          <>
            {primary.slice(0, 2).map((it) => (
              <BarItem key={it.key} it={it} active={active(it.href)} />
            ))}
            <div className="oh-fab-wrap">
              <Link href={fab.href} className="oh-fab" aria-label={fab.label}>
                <Plus size={26} />
              </Link>
            </div>
            {primary.slice(2).map((it) => (
              <BarItem key={it.key} it={it} active={active(it.href)} />
            ))}
            {menuBtn}
          </>
        ) : (
          <>
            {primary.map((it) => (
              <BarItem key={it.key} it={it} active={active(it.href)} />
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
          {avatar}
          <div className="oh-drawer-meta">
            <div className="nm">{user?.name || user?.email}</div>
            {roleLabel && <div className="rl">{roleLabel}</div>}
          </div>
          <button type="button" className="oh-drawer-x" aria-label="Close" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {sectionSwitch && (
          <div className="oh-section-switch drawer">
            <Link
              href="/admin"
              className={sectionSwitch.inSupply ? '' : 'on'}
              onClick={() => setOpen(false)}
            >
              Demand
            </Link>
            <Link
              href="/admin/supply"
              className={sectionSwitch.inSupply ? 'on' : ''}
              onClick={() => setOpen(false)}
            >
              Supply
            </Link>
          </div>
        )}

        <nav className="oh-drawer-nav">
          {items.map((it) => {
            const Icon = ICONS[it.iconName] || LayoutDashboard;
            return (
              <Link
                key={it.key}
                href={it.href}
                className={`oh-drawer-item ${active(it.href) ? 'active' : ''}`}
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
