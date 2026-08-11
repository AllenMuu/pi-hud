// Configuration schema and loader for pi-hud.
// Config location: ~/.pi/agent/pi-hud/config.json (independent of extension dir, survives git updates).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type LineLayout = "expanded" | "compact";
export type ContextValueFormat = "percent" | "tokens" | "both";
export type TokenFormat = "short" | "long";

export interface HudConfig {
  language: "en"; // Reserved; v1 is English-only
  lineLayout: LineLayout;
  pathLevels: number | "full"; // 1 | 2 | 3 | full
  elementOrder: string[]; // expanded-mode element order; omit to hide
  display: {
    showModel: boolean;
    showProvider: boolean;
    showThinkingLevel: boolean;
    showProject: boolean;
    showGit: boolean;
    gitShowDirty: boolean;
    gitShowAheadBehind: boolean;
    showContextBar: boolean;
    contextValue: ContextValueFormat;
    showTokens: boolean;
    tokenFormat: TokenFormat;
    showCost: boolean;
    showTools: boolean;
    toolsMaxVisible: number;
    toolNameMaxLength: number;
    showDuration: boolean;
    showCompactions: boolean;
    showSessionName: boolean;
    showSkills: boolean;
    showContextResources: boolean;
  };
  colors: {
    model: string;
    project: string;
    git: string;
    gitBranch: string;
    context: string;
    warning: string;
    critical: string;
    tokens: string;
    cost: string;
    label: string;
    barFilled: string;
    barEmpty: string;
    contextResources: string;
  };
  thresholds: {
    contextWarning: number; // percent
    contextCritical: number; // percent
  };
}

export const DEFAULT_CONFIG: HudConfig = {
  language: "en",
  lineLayout: "expanded",
  pathLevels: 1,
  elementOrder: [
    "model",
    "project",
    "git",
    "duration",
    "compactions",
    "session",
    "context",
    "tokens",
    "skills",
    "tools",
  ],
  display: {
    showModel: true,
    showProvider: true,
    showThinkingLevel: true,
    showProject: true,
    showGit: true,
    gitShowDirty: true,
    gitShowAheadBehind: false,
    showContextBar: true,
    contextValue: "both",
    showTokens: true,
    tokenFormat: "short",
    showCost: true,
    showTools: true,
    toolsMaxVisible: 4,
    toolNameMaxLength: 20,
    showDuration: true,
    showCompactions: true,
    showSessionName: true,
    showSkills: true,
    showContextResources: true,
  },
  colors: {
    model: "cyan",
    project: "yellow",
    git: "magenta",
    gitBranch: "cyan",
    context: "green",
    warning: "yellow",
    critical: "red",
    tokens: "brightBlue",
    cost: "green",
    label: "dim",
    barFilled: "█",
    barEmpty: "░",
    contextResources: "dim",
  },
  thresholds: {
    contextWarning: 70,
    contextCritical: 85,
  },
};

export function getConfigDir(home: string = homedir()): string {
  return join(home, ".pi", "agent", "pi-hud");
}

export function getConfigPath(home: string = homedir()): string {
  return join(getConfigDir(home), "config.json");
}

// Merge a partial user config over defaults, clamping every field to safe values.
// An empty or malformed file falls back to defaults cleanly.
export function mergeConfig(user: unknown): HudConfig {
  if (!user || typeof user !== "object") return { ...DEFAULT_CONFIG };
  const u = user as Partial<HudConfig>;
  const cfg: HudConfig = { ...DEFAULT_CONFIG, ...u };

  // Shallow-merge nested objects so users can override individual keys
  if (u.display) cfg.display = { ...DEFAULT_CONFIG.display, ...u.display };
  if (u.colors) cfg.colors = { ...DEFAULT_CONFIG.colors, ...u.colors };
  if (u.thresholds) cfg.thresholds = { ...DEFAULT_CONFIG.thresholds, ...u.thresholds };

  // Clamp / validate
  if (cfg.lineLayout !== "expanded" && cfg.lineLayout !== "compact") cfg.lineLayout = "expanded";
  if (typeof cfg.pathLevels === "number") {
    cfg.pathLevels = Math.max(1, Math.min(3, Math.floor(cfg.pathLevels)));
  } else if (cfg.pathLevels !== "full") {
    cfg.pathLevels = 1;
  }
  if (!Array.isArray(cfg.elementOrder) || cfg.elementOrder.length === 0) {
    cfg.elementOrder = [...DEFAULT_CONFIG.elementOrder];
  }
  if (typeof cfg.display.toolsMaxVisible !== "number" || cfg.display.toolsMaxVisible < 0) {
    cfg.display.toolsMaxVisible = 4;
  }
  if (typeof cfg.display.toolNameMaxLength !== "number" || cfg.display.toolNameMaxLength < 0) {
    cfg.display.toolNameMaxLength = 20;
  }
  if (!["percent", "tokens", "both"].includes(cfg.display.contextValue)) {
    cfg.display.contextValue = "both";
  }
  if (!["short", "long"].includes(cfg.display.tokenFormat)) {
    cfg.display.tokenFormat = "short";
  }
  if (typeof cfg.thresholds.contextWarning !== "number" || cfg.thresholds.contextWarning < 0 || cfg.thresholds.contextWarning > 100) {
    cfg.thresholds.contextWarning = 70;
  }
  if (typeof cfg.thresholds.contextCritical !== "number" || cfg.thresholds.contextCritical < 0 || cfg.thresholds.contextCritical > 100) {
    cfg.thresholds.contextCritical = 85;
  }
  return cfg;
}

export function loadConfig(home: string = homedir()): HudConfig {
  const path = getConfigPath(home);
  try {
    if (!existsSync(path)) return { ...DEFAULT_CONFIG };
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    return mergeConfig(parsed);
  } catch {
    // Invalid JSON or read error: fall back silently
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: HudConfig, home: string = homedir()): void {
  const dir = getConfigDir(home);
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "config.json"), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  } catch {
    // Best-effort; ignore write errors
  }
}
