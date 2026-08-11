// ANSI color codes + reusable symbols for the HUD renderer.
// Color names map to SGR sequences; values can be named presets, 256-color numbers, or hex.

const RESET = "\x1b[0m";

const NAMED_COLORS: Record<string, string> = {
  dim: "\x1b[2m",
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
};

function resolveColor(value: string): string {
  if (!value) return "";
  if (NAMED_COLORS[value]) return NAMED_COLORS[value];
  // 256-color number
  if (/^\d+$/.test(value)) {
    const n = parseInt(value, 10);
    if (n >= 0 && n <= 255) return `\x1b[38;5;${n}m`;
  }
  // Hex #rrggbb
  const hex = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const r = parseInt(hex[1].slice(0, 2), 16);
    const g = parseInt(hex[1].slice(2, 4), 16);
    const b = parseInt(hex[1].slice(4, 6), 16);
    return `\x1b[38;2;${r};${g};${b}m`;
  }
  return "";
}

// Wrap text in a color. Pass a color value (named / 256 / hex) and the text.
export function colorize(value: string, text: string): string {
  const code = resolveColor(value);
  if (!code) return text;
  return code + text + RESET;
}

// Join multiple segments with a separator, preserving any embedded color codes.
export function joinSegments(segments: (string | undefined | false)[], sep = " │ "): string {
  return segments.filter((s): s is string => typeof s === "string" && s.length > 0).join(sep);
}

// HUD symbols (terminal-portable unicode; all single graphemes).
export const SYMBOLS = {
  separator: "│",
  sectionSep: "─",
  running: "◐",
  completed: "✓",
  error: "✗",
  duration: "⏱",
  compaction: "⊗",
  branch: "▸",
  skill: "⚡",
  arrowUp: "↑",
  arrowDown: "↓",
  cacheR: "R",
  cacheW: "W",
  bullet: "•",
  ellipsis: "…",
} as const;

// Pick a color for a context percentage based on thresholds.
export function contextColor(percent: number | undefined, warning: number, critical: number, base: string): string {
  if (percent === undefined) return base;
  if (percent >= critical) return "red";
  if (percent >= warning) return "yellow";
  return base;
}

// Pick a color for a usage percentage (similar logic but different default).
export function usageColor(percent: number | undefined, warning: number, base: string): string {
  if (percent === undefined) return base;
  if (percent >= 95) return "red";
  if (percent >= warning) return "brightMagenta";
  return base;
}

export { RESET };
