// Expanded (multi-line) layout.
// Line 1: model | project + git | duration | compactions | session
// Line 2: context | tokens | skills | tools

import type { HudConfig } from "../config.js";
import type { HudState, GitState } from "../state.js";
import {
  renderModel,
  renderProjectAndGit,
  renderContext,
  renderTokens,
  renderTools,
  renderDuration,
  renderCompactions,
  renderSession,
  renderSkills,
} from "./elements.js";
import { joinSegments, SYMBOLS } from "./ansi.js";
import { truncateToWidth, visibleWidth } from "../utils/width.js";

export function renderExpanded(
  state: HudState,
  cfg: HudConfig,
  git: GitState | undefined,
  width: number,
): string[] {
  // Line 1: model + project/git + duration + compactions + session
  const line1Segments = [
    renderModel(state, cfg),
    renderProjectAndGit(state, cfg, git),
    renderDuration(state, cfg),
    renderCompactions(state, cfg),
    renderSession(state, cfg),
  ];
  let line1 = joinSegments(line1Segments, " ");

  // Line 2: context + tokens + skills + tools
  const line2Segments = [
    renderContext(state, cfg, 10),
    renderTokens(state, cfg),
    renderSkills(state, cfg),
    renderTools(state, cfg),
  ];
  let line2 = joinSegments(line2Segments, " │ ");

  // Truncate each line to terminal width
  line1 = line1.length > 0 ? truncateToWidth(line1, Math.max(1, width)) : "";
  line2 = line2.length > 0 ? truncateToWidth(line2, Math.max(1, width)) : "";

  // Return non-empty lines
  const out: string[] = [];
  if (line1) out.push(line1);
  if (line2) out.push(line2);
  return out.length > 0 ? out : [SYMBOLS.sectionSep];
}

// Helper for tests
export { visibleWidth };
