// Expanded (multi-line) layout - claude-hud style.
// Each category gets its own dedicated line; continuation lines are 2-space
// indented. Empty categories are omitted entirely (no blank lines). Each line
// is truncated to the terminal width as a last resort.
//
// Line 1: model | project+git | duration | compactions | session
// Line 2:   Context [bar] [value] | tokens cost
// Line 3:   N ctx | N skills | N tools
// Line 4:   tool activity summary (running detail + completed counts + "+N more")
// Line 5:   active skills

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
  renderContextResources,
} from "./elements.js";
import { colorize, joinSegments, SYMBOLS } from "./ansi.js";
import { truncateToWidth, visibleWidth } from "../utils/width.js";

const INDENT = "  ";

export function renderExpanded(
  state: HudState,
  cfg: HudConfig,
  git: GitState | undefined,
  width: number,
): string[] {
  const w = Math.max(1, width);
  const lines: string[] = [];

  // Line 1: model | project+git | duration | compactions | session
  const line1 = joinSegments(
    [
      renderModel(state, cfg),
      renderProjectAndGit(state, cfg, git),
      renderDuration(state, cfg),
      renderCompactions(state, cfg),
      renderSession(state, cfg),
    ],
    " │ ",
  );
  if (line1) lines.push(line1);

  // Line 2: Context [bar] [value] | tokens cost
  const ctxSeg = renderContext(state, cfg, 10);
  const line2 = joinSegments(
    [
      ctxSeg ? colorize(cfg.colors.label, "Context ") + ctxSeg : undefined,
      renderTokens(state, cfg),
    ],
    " │ ",
  );
  if (line2) lines.push(INDENT + line2);

  // Line 3: context resources (ctx/skills/tools counts)
  const line3 = renderContextResources(state, cfg);
  if (line3) lines.push(INDENT + line3);

  // Line 4: tool activity summary
  const line4 = renderTools(state, cfg);
  if (line4) lines.push(INDENT + line4);

  // Line 5: active skills
  const line5 = renderSkills(state, cfg);
  if (line5) lines.push(INDENT + line5);

  if (lines.length === 0) return [SYMBOLS.sectionSep];
  return lines.map((l) => (visibleWidth(l) > w ? truncateToWidth(l, w) : l));
}

// Helper for tests
export { visibleWidth };
