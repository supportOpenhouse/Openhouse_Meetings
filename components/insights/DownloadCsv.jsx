'use client';

import { Download } from 'lucide-react';

// Build a CSV string (with UTF-8 BOM) from header + row arrays — for the few
// places where the data is already in the browser (e.g. the cross-cut focus list).
export function rowsToCsv(headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([rowsToCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Small "download CSV" control. Pass `href` for a server export endpoint, or
// `onClick` for a client-built CSV. variant: 'icon' | 'button'.
// One <a> + the <style jsx> live in the same JSX tree so styled-jsx scopes it.
export default function DownloadCsv({ href, onClick, label = 'CSV', title = 'Download CSV', variant = 'icon' }) {
  const handleClick = onClick
    ? (e) => {
        e.preventDefault();
        onClick();
      }
    : undefined;

  return (
    <a
      className={`oh-dl ${variant}`}
      href={href || '#'}
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      title={title}
      aria-label={title}
      download={onClick ? undefined : true}
    >
      <Download size={variant === 'icon' ? 14 : 13} strokeWidth={2.25} />
      {variant === 'button' && <span>{label}</span>}
      <style jsx>{`
        .oh-dl {
          display: inline-flex; align-items: center; gap: 6px; text-decoration: none;
          cursor: pointer; line-height: 1; flex-shrink: 0; font: inherit; font-weight: 600;
          color: var(--ink-2); background: var(--paper);
          border: 1px solid var(--border); border-radius: 9px;
          transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease,
            box-shadow 0.16s ease, transform 0.12s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .oh-dl.icon { padding: 6px; }
        .oh-dl.button {
          padding: 6px 12px; font-size: 12px; letter-spacing: 0.01em;
          color: var(--accent); background: var(--accent-soft); border-color: transparent;
        }
        .oh-dl :global(svg) { transition: transform 0.2s ease; }
        .oh-dl:hover {
          color: #fff; border-color: transparent;
          background: var(--grad-accent);
          box-shadow: var(--shadow-accent-glow);
          transform: translateY(-1px);
        }
        .oh-dl:hover :global(svg) { transform: translateY(1px); }
        .oh-dl:active { transform: translateY(0); box-shadow: none; }
        .oh-dl:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `}</style>
    </a>
  );
}
