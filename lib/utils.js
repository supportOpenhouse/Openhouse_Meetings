// Canonicalises a CP code for comparison: case-insensitive, no spaces, no hyphens.
// Used by every code-matching path (inventory lookup, table search, server search)
// so "CP-1284", "cp 1284", and "cp1284" all hit the same record.
export function normalizeCpCode(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).toLowerCase().replace(/[\s-]+/g, '');
}

export function fmtDuration(secs) {
  if (!secs) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// All formatting is pinned to IST (Asia/Kolkata) so the server (UTC runtime)
// and the browser (IST) render the SAME string for a given timestamp — without
// the timeZone pin they diverge and React throws a hydration mismatch (#422).
const IST = 'Asia/Kolkata';
// The IST calendar day of a date, as 'YYYY-MM-DD' — runtime-timezone independent.
function istDay(d) {
  return d.toLocaleDateString('en-CA', { timeZone: IST });
}

export function fmtDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const yest = new Date(now.getTime() - 86400000);
  const time = d.toLocaleTimeString('en-IN', {
    timeZone: IST,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  if (istDay(d) === istDay(now)) return `Today, ${time}`;
  if (istDay(d) === istDay(yest)) return `Yesterday, ${time}`;
  return (
    d.toLocaleDateString('en-IN', {
      timeZone: IST,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) + `, ${time}`
  );
}

export function buildSpeakerTurns(words) {
  if (!words || !words.length) return [];
  const turns = [];
  let cur = null;
  for (const w of words) {
    const speaker = w.speaker_id || 'speaker_0';
    const text = w.text || '';
    if (!cur || cur.speaker !== speaker) {
      if (cur) turns.push(cur);
      cur = { speaker, text };
    } else {
      cur.text += text;
    }
  }
  if (cur) turns.push(cur);
  return turns.map((t) => ({ ...t, text: t.text.trim() })).filter((t) => t.text);
}
