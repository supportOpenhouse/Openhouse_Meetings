export function fmtDuration(secs) {
  if (!secs) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const time = d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  if (isToday) return `Today, ${time}`;
  if (isYest) return `Yesterday, ${time}`;
  return (
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    `, ${time}`
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
