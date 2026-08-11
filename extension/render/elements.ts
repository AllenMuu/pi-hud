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

// (5) Tool activity: ◐ Edit: auth.ts | ✓ Read ×3
export function renderTools(state: HudState, cfg: HudConfig): string | undefined {
  if (!cfg.display.showTools || state.tools.length === 0) return undefined;
  const max = cfg.display.toolsMaxVisible;
  const visible = state.tools.slice(-max);
  // Group: running tools shown first (with ◐), completed ones deduped by name
  const segments: string[] = [];
  const completedCountByName = new Map<string, number>();

  // First: running tools (most recent first within running)
  const running = visible.filter((t) => t.status === "running").reverse();
  for (const t of running) {
    segments.push(renderToolEntry(t, cfg));
  }

  // Then: completed tools, deduped by name with count
  const completed = visible.filter((t) => t.status !== "running");
  for (const t of completed) {
    const key = t.name + (t.target ? ":" + t.target : "");
    completedCountByName.set(key, (completedCountByName.get(key) || 0) + 1);
  }
  // Render deduped completed entries, newest key last
  const seenKeys = new Set<string>();
  for (let i = completed.length - 1; i >= 0 && seenKeys.size < max - running.length; i--) {
    const t = completed[i];
    const key = t.name + (t.target ? ":" + t.target : "");
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const count = completedCountByName.get(key) || 1;
    segments.push(renderToolEntry(t, cfg, count > 1 ? count : undefined));
  }

  return joinSegments(segments, " | ") || undefined;
}

function renderToolEntry(t: ToolEntry, cfg: HudConfig, count?: number): string {
  const glyph = t.status === "running" ? SYMBOLS.running : t.status === "error" ? SYMBOLS.error : SYMBOLS.completed;
  const color = t.status === "running" ? "yellow" : t.status === "error" ? "red" : cfg.colors.label;
  let label = t.name;
  if (t.target) {
    label += ": " + truncate(t.target, cfg.display.toolNameMaxLength);
  }
  if (count && count > 1) {
    label += " ×" + count;
  }
  return colorize(color, glyph + " " + label);
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
