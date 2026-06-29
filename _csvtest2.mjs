import { forgeCookie } from './tools/shots/forge.mjs';
const c = await forgeCookie('ankit@openhouse.in','Ankit Khemka');
const cookie = `${c.name}=${c.value}`;
async function count(url) {
  const r = await fetch(`http://localhost:3000${url}`, { headers: { cookie } });
  const txt = await r.text();
  const rows = txt.replace(/^﻿/, '').split('\r\n').filter(Boolean).length - 1;
  console.log(`${r.status}  ${rows} rows   ${url}`);
}
console.log('— filter honored (since shrinks the set) —');
await count('/api/admin/insights/export?type=engagement');
await count('/api/admin/insights/export?type=engagement&since=2026-06-28T00:00:00');
console.log('— stat subset (param) smaller than tab —');
await count('/api/admin/insights/export?type=visit');
await count('/api/admin/insights/export?type=visit&param=immediate_closure');
console.log('— supply period + outcome subset —');
await count('/api/admin/supply/insights/records?format=csv');
await count('/api/admin/supply/insights/records?format=csv&outcome=onboarded');
console.log('— supply drill JSON (modal) —');
await count('/api/admin/supply/insights/records');
