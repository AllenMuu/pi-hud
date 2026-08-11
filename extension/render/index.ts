// Renderer entry point: picks layout and produces string[] for ctx.ui.setFooter.
// Each string in the array is one terminal line.

import type { HudConfig } from "../config.js";
import type { HudState, GitState } from "../state.js";
import { renderExpanded } from "./expanded.js";
import { renderCompact } from "./compact.js";

export interface RenderInput {
  state: HudState;
  cfg: HudConfig;
  git?: GitState;
  width: number;
}

export function render({ state, cfg, git, width }: RenderInput): string[] {
  if (cfg.lineLayout === "compact") {
    return renderCompact(state, cfg, git, width);
  }
  return renderExpanded(state, cfg, git, width);
}
