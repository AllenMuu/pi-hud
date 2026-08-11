// Compact (two-line) layout - a condensed companion to the expanded layout.
// Line 1: model short | project+git | ctx% | tokens short | current tool | duration
// Line 2:   context resources (ctx/skills/tools counts)   [showContextResources]
//
// Stays single-line when context resources are disabled or not yet populated
// (before the first prompt), so compact mode never wastes a line on emptiness.

import type { HudConfig } from "../config.js";
import type { HudState, GitState } from "../state.js";
import {
  renderModelCompact,
  renderProjectAndGit,
  renderContextCompact,
  renderTokensCompact,
  renderCurrentToolCompact,
  renderDuration,
  renderContextResources,
} from "./elements.js";
import { joinSegments, SYMBOLS } from "./ansi.js";
import { truncateToWidth, visibleWidth } from "../utils/width.js";

const INDENT = "  ";

export function renderCompact(
  state: HudState,
  cfg: HudConfig,
  git: GitState | undefined,
  width: number,
): string[] {
  const w = Math.max(1, width);
  const lines: string[] = [];

  // Line 1: model | project+git | ctx% | tokens | current tool | duration
  const line1 = joinSegments(
    [
      renderModelCompact(state, cfg),
      renderProjectAndGit(state, cfg, git),
      renderContextCompact(state, cfg),
      renderTokensCompact(state, cfg),
      renderCurrentToolCompact(state, cfg),
      renderDuration(state, cfg),
    ],
    " ",
  );
  if (line1) lines.push(line1);

  // Line 2: context resources (ctx/skills/tools counts)
  const line2 = renderContextResources(state, cfg);
  if (line2) lines.push(INDENT + line2);

  if (lines.length === 0) return [SYMBOLS.sectionSep];
  return lines.map((l) => (visibleWidth(l) > w ? truncateToWidth(l, w) : l));
}
