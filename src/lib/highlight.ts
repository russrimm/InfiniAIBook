/**
 * Find where a cited passage sits in its source's full text.
 *
 * The passage is a stored chunk, trimmed and possibly re-joined across
 * paragraph breaks, so an exact substring search misses it whenever
 * whitespace differs. Words are matched in order with any whitespace between
 * them instead. A snippet cut mid-word (citations keep the first 320
 * characters) has its last, partial word dropped first.
 */
export function findPassage(text: string, passage: string): [number, number] | null {
  if (!text || !passage) return null;
  const words = passage.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  if (words.length > 1) words.pop();

  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Long chunks make long patterns; the first 60 words locate it reliably and
  // the end is then extended by the passage's length.
  const probe = words.slice(0, 60);
  const re = new RegExp(probe.map(escape).join("\\s+"));
  const m = re.exec(text);
  if (!m) return null;

  const start = m.index;
  const end = Math.min(text.length, Math.max(start + m[0].length, start + passage.trim().length));
  return [start, end];
}
