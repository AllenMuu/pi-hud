// /pi-hud:configure slash command.
// Walks the user through layout / display toggles via ctx.ui.select / ctx.ui.confirm.
// Saves the resulting config to ~/.pi/agent/pi-hud/config.json.

import type { HudConfig, LineLayout, ContextValueFormat, TokenFormat } from "../config.js";
import { saveConfig, getConfigPath } from "../config.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

interface ConfigureDeps {
  // Wrapped ctx.ui.* so we can test without pi
  select(prompt: string, options: string[]): Promise<string>;
  confirm(prompt: string, defaultValue?: string): Promise<boolean>;
  notify(message: string, level?: "info" | "warning" | "error"): void;
}

async function askLineLayout(d: ConfigureDeps, cfg: HudConfig): Promise<LineLayout> {
  const options = ["expanded (multi-line)", "compact (single line)"];
  const current = cfg.lineLayout === "compact" ? options[1] : options[0];
  const choice = await d.select(`Layout (current: ${current})`, options);
  return choice.includes("compact") ? "compact" : "expanded";
}

async function askContextValue(d: ConfigureDeps, cfg: HudConfig): Promise<ContextValueFormat> {
  const options = ["percent (45%)", "tokens (460k/1024k)", "both (45% / 460k/1024k)"];
  const current = cfg.display.contextValue === "percent" ? options[0] :
                  cfg.display.contextValue === "tokens" ? options[1] : options[2];
  const choice = await d.select(`Context value format (current: ${current})`, options);
  if (choice.startsWith("percent")) return "percent";
  if (choice.startsWith("tokens")) return "tokens";
  return "both";
}

async function askTokenFormat(d: ConfigureDeps, cfg: HudConfig): Promise<TokenFormat> {
  const options = ["short (↑12k ↓3k)", "long (input: 12345 / output: 3456)"];
  const current = cfg.display.tokenFormat === "long" ? options[1] : options[0];
  const choice = await d.select(`Token format (current: ${current})`, options);
  return choice.startsWith("long") ? "long" : "short";
}

async function askToggles(d: ConfigureDeps, cfg: HudConfig): Promise<void> {
  const toggleKeys: Array<[`show${string}`, string]> = [
    ["showModel", "Show model + provider + thinking"],
    ["showProject", "Show project path"],
    ["showGit", "Show git branch"],
    ["showContextBar", "Show context bar"],
    ["showTokens", "Show token usage"],
    ["showCost", "Show cost"],
    ["showTools", "Show tool activity"],
    ["showDuration", "Show session duration"],
    ["showCompactions", "Show compaction count"],
    ["showSessionName", "Show session name / branch"],
    ["showSkills", "Show active skills"],
  ];
  for (const [key, label] of toggleKeys) {
    const current = cfg.display[key as keyof HudConfig["display"]] ? "on" : "off";
    const yes = await d.confirm(`${label} (current: ${current}). Enable?`, current);
    (cfg.display[key as keyof HudConfig["display"]] as boolean) = yes;
  }
}

export async function runConfigure(cfg: HudConfig, d: ConfigureDeps): Promise<HudConfig> {
  cfg.lineLayout = await askLineLayout(d, cfg);
  cfg.display.contextValue = await askContextValue(d, cfg);
  cfg.display.tokenFormat = await askTokenFormat(d, cfg);
  await askToggles(d, cfg);

  saveConfig(cfg);
  d.notify(`pi-hud config saved to ${getConfigPath()}`, "info");
  return cfg;
}

// Adapter that takes a pi extension ctx and exposes the ConfigureDeps interface.
// We wrap each ctx.ui.* call defensively — if a method is missing or throws,
// we degrade gracefully (e.g. default to "no" for confirm).
export function ctxToDeps(ctx: AnyCtx): ConfigureDeps {
  return {
    async select(prompt: string, options: string[]): Promise<string> {
      try {
        const fn = ctx?.ui?.select;
        if (typeof fn !== "function") return options[0];
        const choice = await fn.call(ctx.ui, prompt, options);
        return typeof choice === "string" ? choice : options[0];
      } catch {
        return options[0];
      }
    },
    async confirm(prompt: string, defaultValue?: string): Promise<boolean> {
      try {
        const fn = ctx?.ui?.confirm;
        if (typeof fn !== "function") return false;
        return await fn.call(ctx.ui, prompt, defaultValue);
      } catch {
        return false;
      }
    },
    notify(message: string, level?: "info" | "warning" | "error"): void {
      try {
        const fn = ctx?.ui?.notify;
        if (typeof fn !== "function") return;
        fn.call(ctx.ui, message, level || "info");
      } catch {
        // best-effort
      }
    },
  };
}
