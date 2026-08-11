// Width / visual-length helpers.
// Preferred: re-export @earendil-works/pi-tui's visibleWidth / truncateToWidth so we stay
// consistent with pi's own rendering. If pi-tui isn't importable for any reason, we fall
// back to a small built-in implementation that handles ASCII + common CJK ranges.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let piTui: any = null;
try {
  // Use a dynamic import expression so bundlers / jiti don't fail at load time
  // if the package isn't resolvable (e.g. when running tests outside pi).
  // pi-tui is a peer of pi-coding-agent; it's always present in a running pi process.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  piTui = require("@earendil-works/pi-tui");
} catch {
  piTui = null;
}

// Approximate East-Asian-ambiguous / wide ranges.
// This is NOT a full Unicode width implementation — it covers the common case
// (CJK, hiragana, katakana, hangul, CJK punctuation). Wide emoji are best-effort.
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK Radicals, Kangxi
    (code >= 0x3040 && code <= 0x33bf) || // Hiragana, Katakana, CJK symbols
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Ext A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth currency
    (code >= 0x1f300 && code <= 0x1faff) || // Emoji + symbols
    (code >= 0x20000 && code <= 0x2fffd) // CJK Ext B-F
  );
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

export function visibleWidth(s: string): number {
  const cleaned = stripAnsi(s);
  if (piTui && typeof piTui.visibleWidth === "function") {
    try {
      return piTui.visibleWidth(cleaned);
    } catch {
      // fall through
    }
  }
  // Simple code-unit counter with wide-char doubling
  let w = 0;
  for (const ch of cleaned) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
    w += isWide(code) ? 2 : 1;
  }
  return w;
}

export function truncateToWidth(s: string, max: number): string {
  if (max <= 0) return "";
  if (piTui && typeof piTui.truncateToWidth === "function") {
    try {
      return piTui.truncateToWidth(s, max);
    } catch {
      // fall through
    }
  }
  const cleaned = stripAnsi(s);
  if (visibleWidth(cleaned) <= max) return cleaned;
  // Truncate by code unit, checking accumulated width
  let w = 0;
  let out = "";
  for (const ch of cleaned) {
    const code = ch.codePointAt(0) ?? 0;
    const cw = code < 0x20 || (code >= 0x7f && code < 0xa0) ? 0 : isWide(code) ? 2 : 1;
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return out + "…";
}

// Wrap a string to a max width, breaking on spaces. Returns lines.
export function wrapToWidth(s: string, max: number): string[] {
  if (max <= 0) return [""];
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const candidate = cur ? cur + " " + word : word;
    if (visibleWidth(candidate) <= max) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
