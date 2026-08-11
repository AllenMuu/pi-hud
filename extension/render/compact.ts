// Compact (single-line) layout.
// Shows 6 core items: model short | project+git | ctx% | tokens short | current tool | duration

import type { HudConfig } from "../config.js";
import type { HudState, GitState } from "../state.js";
import {
  renderModelCompact,
  renderProjectAndGit,
  renderContextCompact,
  renderTokensCompact,
  renderCurrentToolCompact,
  renderDuration,
} from "./elements.js";
import { joinSegments, SYMBOLS } from "./ansi.js";
import { truncateToWidth } from "../utils/width.js";

export function renderCompact(
  state: HudState,
  cfg: HudConfig,
  git: GitState | undefined,
  width: number,
): string[] {
  const segments = [
    renderModelCompact(state, cfg),
    renderProjectAndGit(state, cfg, git),
    renderContextCompact(state, cfg),
    renderTokensCompact(state, cfg),
    renderCurrentToolCompact(state, cfg),
    renderDuration(state, cfg),
  ];
  let line = joinSegments(segments, " ");
  if (line.length === 0) return [SYMBOLS.sectionSep];
  line = truncateToWidth(line, Math.max(1, width));
  return [line];
}
