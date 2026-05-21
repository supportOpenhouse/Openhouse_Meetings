// Parses a phone call-recording filename into a usable label, phone number,
// and timestamp. Android call recorders name files like:
//   9711187647-2605211617.mp3      → number + YYMMDDHHmm
//   Chumki Bose-2605211537.mp3     → saved contact name + timestamp
//   7827372890_20260521_150612.amr → number + date_time
// The leading segment (before the trailing timestamp) is the label; if it
// contains a 10+ digit run that's the phone number.

function parseTimestamp(digits) {
  let y, mo, d, h = 0, mi = 0, s = 0;
  if (digits.length === 14) {
    // YYYYMMDDHHmmss
    y = +digits.slice(0, 4); mo = +digits.slice(4, 6); d = +digits.slice(6, 8);
    h = +digits.slice(8, 10); mi = +digits.slice(10, 12); s = +digits.slice(12, 14);
  } else if (digits.length === 12) {
    // YYMMDDHHmmss
    y = 2000 + +digits.slice(0, 2); mo = +digits.slice(2, 4); d = +digits.slice(4, 6);
    h = +digits.slice(6, 8); mi = +digits.slice(8, 10); s = +digits.slice(10, 12);
  } else if (digits.length === 10) {
    // YYMMDDHHmm
    y = 2000 + +digits.slice(0, 2); mo = +digits.slice(2, 4); d = +digits.slice(4, 6);
    h = +digits.slice(6, 8); mi = +digits.slice(8, 10);
  } else if (digits.length === 8) {
    // YYYYMMDD
    y = +digits.slice(0, 4); mo = +digits.slice(4, 6); d = +digits.slice(6, 8);
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const dt = new Date(y, mo - 1, d, h, mi, s);
  return isNaN(dt.getTime()) ? null : dt;
}

// Returns { label, cp_mobile, cp_name, started_at }.
// `lastModifiedMs` is the File.lastModified fallback for the timestamp.
export function parseCallFilename(filename, lastModifiedMs) {
  const base = String(filename || '')
    .replace(/\.[a-z0-9]+$/i, '') // drop extension
    .trim();

  // A trailing run of 8-14 digits (possibly _- separated) is the timestamp.
  let label = base;
  let startedAt = null;
  const tsMatch = base.match(/[-_ ]+(\d{8,14}(?:[-_ ]\d{2,6})?)$/);
  if (tsMatch) {
    label = base.slice(0, tsMatch.index).trim().replace(/[-_ ]+$/, '');
    startedAt = parseTimestamp(tsMatch[1].replace(/[-_ ]/g, ''));
  }
  if (!label) label = base;

  // Phone number = first run of 10+ digits in the label.
  const phoneMatch = label.match(/(\d{10,})/);
  const cp_mobile = phoneMatch ? phoneMatch[1].replace(/\D/g, '').slice(-10) : null;

  return {
    label,
    cp_mobile,
    // The label is what shows in the dashboard — the number, or the saved name.
    cp_name: label || cp_mobile || 'Call recording',
    started_at: startedAt || (lastModifiedMs ? new Date(lastModifiedMs) : new Date()),
  };
}
