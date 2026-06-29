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
export default function DownloadCsv({ href, onClick, label = 'CSV', title = 'Download CSV', variant = 'icon' }) {
  const cls = `oh-dl ${variant}`;
  const inner = (
    <>
      <Download size={variant === 'icon' ? 14 : 13} />
      {variant === 'button' && <span>{label}</span>}
      <style jsx>{`
        .oh-dl {
          display: inline-flex; align-items: center; gap: 5px; text-decoration: none;
          color: var(--ink-2); border: 1px solid var(--border); border-radius: 8px;
          background: var(--paper); cursor: pointer; line-height: 1; flex-shrink: 0;
          font: inherit;
        }
        .oh-dl.icon { padding: 5px; }
        .oh-dl.button { padding: 5px 10px; font-size: 12px; font-weight: 500; }
        .oh-dl:hover { color: var(--accent); border-color: var(--accent); }
      `}</style>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} title={title} aria-label={title}>
        {inner}
      </button>
    );
  }
  return (
    <a className={cls} href={href} title={title} aria-label={title} download>
      {inner}
    </a>
  );
}
