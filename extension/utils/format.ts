// Formatting helpers for tokens, costs, durations, and percentages.
// All output is terminal-safe (no control chars); symbols are unicode arrows.

import type { ContextValueFormat, TokenFormat } from "../config.js";

// Format a token count with k/M suffix. 12345 -> "12k", 1500000 -> "1.5M".
export function formatTokens(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    return (k >= 100 ? String(Math.round(k)) : k.toFixed(k < 10 ? 1 : 0)) + "k";
  }
  const m = n / 1_000_000;
  return m.toFixed(m < 10 ? 1 : 0) + "M";
}

// Short token summary: ↑12k ↓3k R8k W1k
export function formatTokensShort(u: {
  input?: number; output?: number; cacheRead?: number; cacheWrite?: number;
}): string {
  const parts: string[] = [];
  if (u.input !== undefined && u.input > 0) parts.push("↑" + formatTokens(u.input));
  if (u.output !== undefined && u.output > 0) parts.push("↓" + formatTokens(u.output));
  if (u.cacheRead !== undefined && u.cacheRead > 0) parts.push("R" + formatTokens(u.cacheRead));
  if (u.cacheWrite !== undefined && u.cacheWrite > 0) parts.push("W" + formatTokens(u.cacheWrite));
  return parts.join(" ");
}

// Long token summary: input: 12345 / output: 3456 / cacheRead: 8765 / cacheWrite: 1024
export function formatTokensLong(u: {
  input?: number; output?: number; cacheRead?: number; cacheWrite?: number;
}): string {
  const parts: string[] = [];
  if (u.input !== undefined) parts.push("input: " + u.input.toLocaleString("en-US"));
  if (u.output !== undefined) parts.push("output: " + u.output.toLocaleString("en-US"));
  if (u.cacheRead !== undefined) parts.push("cacheRead: " + u.cacheRead.toLocaleString("en-US"));
  if (u.cacheWrite !== undefined) parts.push("cacheWrite: " + u.cacheWrite.toLocaleString("en-US"));
  return parts.join(" / ");
}

export function formatTokenSummary(
  u: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number },
  format: TokenFormat,
): string {
  return format === "long" ? formatTokensLong(u) : formatTokensShort(u);
}

// Format a USD cost. 0.02 -> "$0.02", 1.5 -> "$1.50", 0.001 -> "$0.001".
export function formatCost(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return "$0.00";
  if (n < 0.01) return "$" + n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return "$" + n.toFixed(2);
}

// Format a duration in ms as a human short string: 5m, 1h 30m, 2h, 45s.
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// Context value formatter. Renders a percentage + optional token counts based on format.
// percent: "45%"
// tokens:  "460k/1024k"
// both:    "45% (460k/1024k)"
export function formatContextValue(
  usedTokens: number | undefined,
  windowSize: number | undefined,
  format: ContextValueFormat,
): string {
  const pct = computePercent(usedTokens, windowSize);
  const usedStr = usedTokens !== undefined ? formatTokens(usedTokens) : "?";
  const winStr = windowSize !== undefined ? formatTokens(windowSize) : "?";

  if (format === "percent") return pct !== undefined ? `${pct}%` : "—";
  if (format === "tokens") return `${usedStr}/${winStr}`;
  // both
  if (pct !== undefined) return `${pct}% (${usedStr}/${winStr})`;
  return `${usedStr}/${winStr}`;
}

// Compute a percentage from tokens used and window size.
export function computePercent(used: number | undefined, window: number | undefined): number | undefined {
  if (used === undefined || window === undefined || window <= 0) return undefined;
  return Math.max(0, Math.min(100, Math.round((used / window) * 100)));
}

// Render a progress bar of the form ██████░░░░ given a percent and total width.
export function renderBar(percent: number | undefined, width: number, filled: string, empty: string): string {
  if (percent === undefined || !Number.isFinite(percent) || width <= 0) return empty.repeat(Math.max(0, width));
  const clamped = Math.max(0, Math.min(100, percent));
  const filledCount = Math.round((clamped / 100) * width);
  return filled.repeat(filledCount) + empty.repeat(Math.max(0, width - filledCount));
}

// Truncate a string to a max length, appending "…" if truncated.
// Visual-width-aware: callers should pre-compute if the string contains wide chars;
// this is a simple code-unit count for the common case.
export function truncate(str: string, max: number): string {
  if (max <= 0) return "";
  if (str.length <= max) return str;
  if (max <= 1) return "…";
  return str.slice(0, max - 1) + "…";
}

// Extract the last N path segments from an absolute path.
export function formatPath(p: string, levels: number | "full"): string {
  if (!p) return "";
  if (levels === "full") return p;
  const parts = p.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  const last = parts.slice(-levels);
  return (p.startsWith("/") ? "/" : "") + last.join("/");
}
