// Per-element renderers. Each function takes the current state + config and returns a colored string segment.
// Layouts (expanded.ts / compact.ts) assemble these into lines.

import type { HudConfig } from "../config.js";
import type { HudState, GitState, ToolEntry } from "../state.js";
import {
  formatTokensShort,
  formatTokensLong,
  formatTokenSummary,
  formatCost,
  formatDuration,
  formatContextValue,
  computePercent,
  renderBar,
  truncate,
  formatPath,
} from "../utils/format.js";
import { colorize, joinSegments, SYMBOLS, contextColor } from "./ansi.js";

// (1) Model + provider + thinking level badge: [glm-5.2 │ ark │ medium]
export function renderModel(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showModel) return undefined;
  const parts: string[] = [];
  if (state.modelName || state.modelId) {
    parts.push(state.modelName || state.modelId || "");
  }
  if (cfg.display.showProvider && state.providerId) {
    parts.push(state.providerId);
  }
  if (cfg.display.showThinkingLevel && state.thinkingLevel) {
    parts.push(state.thinkingLevel);
  }
  if (parts.length === 0) return undefined;
  return colorize(cfg.colors.model, "[" + parts.join(" │ ") + "]");
}

// (2) Project path + git branch
export function renderProjectAndGit(
  state: HudState,
  cfg: HudConfig,
  git: GitState | undefined,
): string | undefined {
  const parts: (string | undefined)[] = [];

  if (cfg.display.showProject && state.cwd) {
    parts.push(colorize(cfg.colors.project, formatPath(state.cwd, cfg.pathLevels)));
  }

  if (cfg.display.showGit && git && git.isRepo && git.branch) {
    const branchStr = (cfg.display.gitShowDirty && git.dirty ? git.branch + "*" : git.branch)
      + (cfg.display.gitShowAheadBehind && (git.ahead > 0 || git.behind > 0)
        ? ` ↑${git.ahead} ↓${git.behind}`
        : "");
    const wrapped = colorize(cfg.colors.git, "git:(") + colorize(cfg.colors.gitBranch, branchStr) + colorize(cfg.colors.git, ")");
    parts.push(wrapped);
  }

  const joined = joinSegments(parts, " ");
  return joined || undefined;
}

// (3) Context bar + value
export function renderContext(state: HudState, cfg: HudConfig, barWidth = 10): string | undefined {
  if (!cfg.display.showContextBar) return undefined;
  const used = state.contextTokensUsed;
  const win = state.contextWindow;
  const pct = computePercent(used, win);
  const bar = renderBar(pct, barWidth, cfg.colors.barFilled, cfg.colors.barEmpty);
  const color = contextColor(pct, cfg.thresholds.contextWarning, cfg.thresholds.contextCritical, cfg.colors.context);
  const value = formatContextValue(used, win, cfg.display.contextValue);
  return colorize(color, bar) + " " + colorize(cfg.colors.label, value);
}

// (4) Token usage + cost
export function renderTokens(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showTokens || !state.usage) return undefined;
  const u = state.usage;
  const tokenStr = formatTokenSummary(u, cfg.display.tokenFormat);
  const parts = [colorize(cfg.colors.tokens, tokenStr)];
  if (cfg.display.showCost && u.costTotal !== undefined) {
    parts.push(colorize(cfg.colors.cost, formatCost(u.costTotal)));
  }
  return joinSegments(parts, " ");
}

// (5) Tool activity: ◐ Edit: auth.ts | ✓ Bash ×15 | ✓ Write ×2 | +1 more
// Running + error tools get full detail (with target); completed tools are
// summarized as "✓ Name ×N" deduped by name, capped at toolsMaxVisible with a
// trailing "+N more". Mirrors claude-hud's tool summary line.
export function renderTools(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showTools || state.tools.length === 0) return undefined;
  const max = cfg.display.toolsMaxVisible;
  const segments: string[] = [];

  // Running then error tools: show individually with target (rare, actionable).
  // Running is "now"; errors need attention but are already done.
  const running = state.tools.filter((t) => t.status === "running").reverse();
  const errored = state.tools.filter((t) => t.status === "error").reverse();
  for (const t of [...running, ...errored]) {
    segments.push(renderToolEntry(t, cfg));
  }

  // Completed tools: dedup by name, count occurrences, most-used first.
  // Array.sort is stable, so newest-first (from the reverse iteration) is the
  // tiebreaker for tools with equal counts.
  const completed = state.tools.filter((t) => t.status === "completed");
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (let i = completed.length - 1; i >= 0; i--) {
    const name = completed[i].name;
    if (counts.has(name)) {
      counts.set(name, (counts.get(name) || 0) + 1);
    } else {
      counts.set(name, 1);
      order.push(name);
    }
  }
  order.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));

  const shown = order.slice(0, max);
  const hidden = order.length - shown.length;
  for (const name of shown) {
    const count = counts.get(name) || 1;
    const label = capitalize(name) + (count > 1 ? " ×" + count : "");
    segments.push(colorize("green", SYMBOLS.completed + " " + label));
  }
  if (hidden > 0) {
    segments.push(colorize(cfg.colors.label, "+" + hidden + " more"));
  }

  return segments.length > 0 ? segments.join(" | ") : undefined;
}

function renderToolEntry(t: ToolEntry, cfg: HudConfig, count?: number): string {
  const glyph = t.status === "running" ? SYMBOLS.running : t.status === "error" ? SYMBOLS.error : SYMBOLS.completed;
  const color = t.status === "running" ? "yellow" : t.status === "error" ? "red" : "green";
  let label = t.name;
  if (t.target) {
    label += ": " + truncate(t.target, cfg.display.toolNameMaxLength);
  }
  if (count && count > 1) {
    label += " ×" + count;
  }
  return colorize(color, glyph + " " + label);
}

// Capitalize the first letter of a tool name for display: "bash" -> "Bash".
function capitalize(name: string): string {
  return name.length > 0 ? name[0].toUpperCase() + name.slice(1) : name;
}

// (6) Session duration: ⏱ 5m
export function renderDuration(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showDuration) return undefined;
  const ms = Date.now() - state.sessionStart;
  return colorize(cfg.colors.label, SYMBOLS.duration + " " + formatDuration(ms));
}

// (7) Compaction count: ⊗ 2 (hidden until first compaction)
export function renderCompactions(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showCompactions || state.compactionCount === 0) return undefined;
  return colorize(cfg.colors.label, SYMBOLS.compaction + " " + state.compactionCount);
}

// (8) Session name / branch: ▸ main
export function renderSession(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showSessionName) return undefined;
  const name = state.sessionName || state.sessionLeafId;
  if (!name) return undefined;
  return colorize(cfg.colors.model, SYMBOLS.branch + " " + name);
}

// (9) Active skills: ⚡ ui, tdd
export function renderSkills(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showSkills || state.skills.size === 0) return undefined;
  const names = Array.from(state.skills).slice(-5);
  return colorize(cfg.colors.tokens, SYMBOLS.skill + " " + names.join(", "));
}

// (10) Context resources: 2 ctx | 6 skills | 4 tools
// Counts of context files / loaded skills / selected tools captured from
// before_agent_start. Hidden until the first prompt populates the fields.
export function renderContextResources(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showContextResources) return undefined;
  const parts: string[] = [];
  if (state.contextFilePaths !== undefined) {
    parts.push(`${state.contextFilePaths.length} ctx`);
  }
  if (state.loadedSkillsCount !== undefined) {
    parts.push(`${state.loadedSkillsCount} skills`);
  }
  if (state.selectedToolsCount !== undefined) {
    parts.push(`${state.selectedToolsCount} tools`);
  }
  if (parts.length === 0) return undefined;
  return colorize(cfg.colors.contextResources, parts.join(" | "));
}

// Compact-mode helpers: shorter versions of the above.

export function renderModelCompact(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showModel) return undefined;
  const name = state.modelName || state.modelId;
  if (!name) return undefined;
  return colorize(cfg.colors.model, "[" + name + "]");
}

export function renderContextCompact(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showContextBar) return undefined;
  const used = state.contextTokensUsed;
  const win = state.contextWindow;
  const pct = computePercent(used, win);
  const color = contextColor(pct, cfg.thresholds.contextWarning, cfg.thresholds.contextCritical, cfg.colors.context);
  const label = pct !== undefined ? `Ctx ${pct}%` : "Ctx —";
  return colorize(color, label);
}

export function renderTokensCompact(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showTokens || !state.usage) return undefined;
  return colorize(cfg.colors.tokens, formatTokensShort(state.usage));
}

export function renderCurrentToolCompact(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showTools || state.tools.length === 0) return undefined;
  const last = state.tools[state.tools.length - 1];
  return renderToolEntry(last, cfg);
}
