// /pi-hud:configure slash command.
// Walks the user through layout / display toggles via ctx.ui.select.
// Saves the resulting config to ~/.pi/agent/pi-hud/config.json.
//
// Cancellation: pi's ctx.ui.select resolves to undefined when the user presses
// ESC. We treat that as an abort signal - runConfigure throws ConfigureAborted,
// the command handler catches it, discards partial mutations, and notifies the
// user. This is the fix for the "configure never ends" loop: previously undefined
// was silently coerced to options[0] and the flow marched on, so the user could
// never exit a 14-step modal gauntlet.

import type { HudConfig, LineLayout, ContextValueFormat, TokenFormat } from "../config.js";
import { saveConfig, getConfigPath } from "../config.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

/** Thrown when the user cancels (ESC) any select prompt. */
export class ConfigureAborted extends Error {
  constructor() {
    super("pi-hud configure aborted by user");
    this.name = "ConfigureAborted";
  }
}

interface ConfigureDeps {
  // Wrapped ctx.ui.* so we can test without pi.
  // select resolves to undefined when the user cancels (pi behavior).
  select(prompt: string, options: string[]): Promise<string | undefined>;
  notify(message: string, level?: "info" | "warning" | "error"): void;
}

// Return the user's choice or abort the whole flow on cancel.
function requireChoice(choice: string | undefined): string {
  if (typeof choice !== "string") throw new ConfigureAborted();
  return choice;
}

async function askLineLayout(d: ConfigureDeps, cfg: HudConfig): Promise<LineLayout> {
  const options = ["expanded (multi-line)", "compact (single line)"];
  const current = cfg.lineLayout === "compact" ? options[1] : options[0];
  const choice = requireChoice(await d.select(`Layout (current: ${current})`, options));
  return choice.includes("compact") ? "compact" : "expanded";
}

async function askContextValue(d: ConfigureDeps, cfg: HudConfig): Promise<ContextValueFormat> {
  const options = ["percent (45%)", "tokens (460k/1024k)", "both (45% / 460k/1024k)"];
  const current = cfg.display.contextValue === "percent" ? options[0] :
                  cfg.display.contextValue === "tokens" ? options[1] : options[2];
  const choice = requireChoice(await d.select(`Context value format (current: ${current})`, options));
  if (choice.startsWith("percent")) return "percent";
  if (choice.startsWith("tokens")) return "tokens";
  return "both";
}

async function askTokenFormat(d: ConfigureDeps, cfg: HudConfig): Promise<TokenFormat> {
  const options = ["short (↑12k ↓3k)", "long (input: 12345 / output: 3456)"];
  const current = cfg.display.tokenFormat === "long" ? options[1] : options[0];
  const choice = requireChoice(await d.select(`Token format (current: ${current})`, options));
  return choice.startsWith("long") ? "long" : "short";
}

// Display toggle keys + human labels.
const TOGGLE_KEYS: Array<[`show${string}`, string]> = [
  ["showModel", "Model + provider + thinking"],
  ["showProject", "Project path"],
  ["showGit", "Git branch"],
  ["showContextBar", "Context bar"],
  ["showTokens", "Token usage"],
  ["showCost", "Cost"],
  ["showTools", "Tool activity"],
  ["showDuration", "Session duration"],
  ["showCompactions", "Compaction count"],
  ["showSessionName", "Session name / branch"],
  ["showSkills", "Active skills"],
  ["showContextResources", "Context resources (ctx/skills/tools counts)"],
];

// Interactive flip menu: select a toggle to flip it, or "Done" to finish.
// Replaces the old 11-sequential-confirm flow. ESC at any time aborts the whole
// configure. The user only touches the toggles they care about, so the common
// path (just want to flip one or two) is far shorter than 11 Yes/No prompts.
async function askToggles(d: ConfigureDeps, cfg: HudConfig): Promise<void> {
  const DONE = "Done - save and exit";
  for (;;) {
    const options = [DONE, ...TOGGLE_KEYS.map(([key, label]) => {
      const on = cfg.display[key as keyof HudConfig["display"]] as boolean;
      return `${on ? "[x]" : "[ ]"} ${label}`;
    })];
    const choice = requireChoice(await d.select("Display toggles - select to flip", options));
    if (choice === DONE) return;
    const idx = options.indexOf(choice) - 1; // offset past the Done entry
    if (idx >= 0 && idx < TOGGLE_KEYS.length) {
      const key = TOGGLE_KEYS[idx][0];
      const current = cfg.display[key as keyof HudConfig["display"]] as boolean;
      (cfg.display[key as keyof HudConfig["display"]] as boolean) = !current;
    }
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
// We wrap each ctx.ui.* call defensively - if a method is missing or throws,
// we degrade gracefully (e.g. default to options[0] for select).
export function ctxToDeps(ctx: AnyCtx): ConfigureDeps {
  return {
    async select(prompt: string, options: string[]): Promise<string | undefined> {
      try {
        const fn = ctx?.ui?.select;
        // No interactive UI available (e.g. non-TUI mode): pick the default and
        // keep flowing so configure still completes without hanging.
        if (typeof fn !== "function") return options[0];
        return await fn.call(ctx.ui, prompt, options);
      } catch {
        return options[0];
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
