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

// All date formatting is derived from a fixed +5:30 (IST) offset and built by
// hand so the server and EVERY browser render a byte-identical string for a
// given timestamp. toLocale*/Intl can't be trusted here: its output (notably
// the space before am/pm — a regular space on some ICU versions, a narrow
// no-break space U+202F on others) changes between ICU versions, so the server
// (its ICU) and the client (the browser's ICU, e.g. iOS Safari) produced
// DIFFERENT text and React threw a hydration mismatch (#422 / #425). Pinning the
// timeZone (the old approach) wasn't enough — the format chars still diverged.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// IST calendar + clock parts of a timestamp, read off a UTC clock shifted +5:30.
function istParts(ts) {
  const d = new Date(new Date(ts).getTime() + IST_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth(),
    day: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
  };
}
const istDayKey = (p) => `${p.y}-${p.mo}-${p.day}`;
function istTime12(p) {
  const ampm = p.h < 12 ? 'am' : 'pm';
  const hr = p.h % 12 || 12;
  return `${hr}:${String(p.mi).padStart(2, '0')} ${ampm}`;
}

export function fmtDate(ts) {
  const p = istParts(ts);
  const time = istTime12(p);
  const key = istDayKey(p);
  if (key === istDayKey(istParts(Date.now()))) return `Today, ${time}`;
  if (key === istDayKey(istParts(Date.now() - 86400000))) return `Yesterday, ${time}`;
  return `${p.day} ${MONTHS_SHORT[p.mo]} ${p.y}, ${time}`;
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
