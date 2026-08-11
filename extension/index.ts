// pi-hud extension entry point.
// Loaded by pi at agent boot via jiti. Default export is a factory that receives
// the pi ExtensionAPI and wires up event subscriptions, command registration, and footer rendering.

import { loadConfig, saveConfig } from "./config.js";
import { createInitialState, addTool, updateToolStatus, recordSkill, extractToolTarget, type HudState, type GitState } from "./state.js";
import { createGitSource } from "./sources/git.js";
import { readModelInfo, readContextUsage, readAssistantUsage } from "./sources/context.js";
import { readSessionInfo, readSessionNameFromEvent } from "./sources/session.js";
import { render } from "./render/index.js";
import { runConfigure, ctxToDeps } from "./commands/configure.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPi = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

const MAX_TOOLS = 20;
const RENDER_DEBOUNCE_MS = 100;

export default function piHudExtension(pi: AnyPi) {
  // Reload-safe: any error in the extension is logged by pi but doesn't crash the agent.
  try {
    let cfg = loadConfig();
    let state: HudState = createInitialState();
    const gitSource = createGitSource((cmd: string, args: string[], opts?: { signal?: AbortSignal; timeout?: number }) =>
      pi.exec(cmd, args, opts),
    );

    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRenderedLines: string[] = [];
    // Most-recent ctx captured from an event handler. The render timer
    // coalesces event bursts and always re-snapshots from this ctx so it
    // never renders against a stale closure-captured ctx.
    let lastCtx: AnyCtx | undefined;

    function debugLog(...args: unknown[]): void {
      try {
        if (process?.env?.PI_HUD_DEBUG === "1") {
          // eslint-disable-next-line no-console
          console.error("[pi-hud]", ...args);
        }
      } catch {
        // best-effort
      }
    }

    // Sync snapshot of model + context usage from a fresh ctx into in-memory state.
    function snapshotFromCtx(ctx: AnyCtx): void {
      try {
        // Stale ctx throws on property access — bail silently if so.
        try {
          void ctx?.model;
        } catch {
          return;
        }

        const model = readModelInfo(ctx);
        if (model.modelId) state.modelId = model.modelId;
        if (model.modelName) state.modelName = model.modelName;
        if (model.providerId) state.providerId = model.providerId;
        if (model.thinkingLevel) state.thinkingLevel = model.thinkingLevel;
        if (model.contextWindow) state.contextWindow = model.contextWindow;
        const usage = readContextUsage(ctx);
        if (usage.tokensUsed !== undefined) state.contextTokensUsed = usage.tokensUsed;
        if (usage.windowSize !== undefined && !state.contextWindow) state.contextWindow = usage.windowSize;
      } catch (err) {
        debugLog("snapshotFromCtx error:", err);
      }
    }

    // Synchronous render using cached git state. Safe to call from event handlers.
    function renderNow(ctx: AnyCtx, git?: GitState): void {
      try {
        // No-op in non-TUI modes (pi has no visible footer there).
        // ctx.hasUI is a getter that throws if ctx is stale — bail if so.
        let hasUI: boolean | undefined;
        try {
          hasUI = ctx?.hasUI;
        } catch {
          return;
        }
        if (hasUI === false) return;
        const ui = ctx?.ui;
        if (!ui || typeof ui.setFooter !== "function") return;

        const width = (typeof process?.stdout?.columns === "number" && process.stdout.columns > 0)
          ? Math.max(20, process.stdout.columns - 4)
          : 120;
        const lines = render({ state, cfg, git, width });

        // Avoid redundant writes if nothing changed
        if (lines.join("\n") === lastRenderedLines.join("\n")) return;
        lastRenderedLines = lines;

        // pi's setFooter accepts either a string[], or a component with a render(width) method.
        // We pass a lightweight component so pi can re-render on width changes.
        ui.setFooter({
          render: (_w: number) => lines,
        });
      } catch (err) {
        // Stale ctx, missing ui, or pi is shutting down — never crash
        debugLog("renderNow error:", err);
      }
    }

    // Async refresh that also refreshes git status, then re-renders.
    // Called from event handlers; ctx must be fresh at the time of the call.
    async function refreshFooter(ctx: AnyCtx): Promise<void> {
      try {
        const cwd = state.cwd || process.cwd();
        const git = await gitSource.get(cwd);
        // Snapshot after await in case ctx model fields changed while awaiting git
        snapshotFromCtx(ctx);
        renderNow(ctx, git);
      } catch (err) {
        debugLog("refreshFooter error:", err);
      }
    }

    // Coalesce a burst of events into one render. ctx must be fresh when scheduled.
    function scheduleRefresh(ctx: AnyCtx): void {
      lastCtx = ctx;
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        renderTimer = null;
        const ctx = lastCtx;
        lastCtx = undefined;
        if (ctx) void refreshFooter(ctx);
      }, RENDER_DEBOUNCE_MS);
    }

    // --- Event subscriptions ---------------------------------------------

    // session_start: capture cwd, session start time, session name. Then initial render.
    pi.on("session_start", (event: AnyEvent, ctx: AnyCtx) => {
      try {
        if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
        lastCtx = undefined;
        state = createInitialState(); // fresh state per session
        state.cwd = ctx?.cwd || process.cwd();
        const info = readSessionInfo(ctx);
        if (info.sessionStart) state.sessionStart = info.sessionStart;
        if (info.sessionName) state.sessionName = info.sessionName;
        if (info.leafId) state.sessionLeafId = info.leafId;
        gitSource.invalidate();
        void refreshFooter(ctx);
      } catch (err) {
        debugLog("session_start error:", err);
      }
    });

    // session_info_changed: update session name
    pi.on("session_info_changed", (event: AnyEvent, ctx: AnyCtx) => {
      try {
        const name = readSessionNameFromEvent(event);
        if (name) state.sessionName = name;
        scheduleRefresh(ctx);
      } catch (err) {
        debugLog("session_info_changed error:", err);
      }
    });

    // model_select / thinking_level_select: live updates to model badge
    pi.on("model_select", (_event: AnyEvent, ctx: AnyCtx) => {
      try {
        const model = readModelInfo(ctx);
        if (model.modelId) state.modelId = model.modelId;
        if (model.modelName) state.modelName = model.modelName;
        if (model.providerId) state.providerId = model.providerId;
        if (model.contextWindow) state.contextWindow = model.contextWindow;
        scheduleRefresh(ctx);
      } catch (err) {
        debugLog("model_select error:", err);
      }
    });

    pi.on("thinking_level_select", (_event: AnyEvent, ctx: AnyCtx) => {
      try {
        const model = readModelInfo(ctx);
        if (model.thinkingLevel) state.thinkingLevel = model.thinkingLevel;
        scheduleRefresh(ctx);
      } catch (err) {
        debugLog("thinking_level_select error:", err);
      }
    });

    // message_end: capture usage + cost from the assistant message
    pi.on("message_end", (event: AnyEvent, ctx: AnyCtx) => {
      try {
        // event.message is the AssistantMessage; defensively probe several shapes
        const msg = event?.message ?? event?.assistantMessage ?? event;
        const usage = readAssistantUsage(msg);
        if (usage) {
          state.usage = {
            input: usage.input,
            output: usage.output,
            cacheRead: usage.cacheRead,
            cacheWrite: usage.cacheWrite,
            totalTokens: usage.totalTokens,
            costInput: usage.costInput,
            costOutput: usage.costOutput,
            costCacheRead: usage.costCacheRead,
            costCacheWrite: usage.costCacheWrite,
            costTotal: usage.costTotal,
            at: Date.now(),
          };
          // If we still don't have a contextWindow, derive from totalTokens if it looks like a window marker
          if (!state.contextWindow && usage.totalTokens) {
            state.contextTokensUsed = usage.totalTokens;
          }
        }
        scheduleRefresh(ctx);
      } catch (err) {
        debugLog("message_end error:", err);
      }
    });

    // tool_execution_*: track tool activity
    pi.on("tool_execution_start", (event: AnyEvent, ctx: AnyCtx) => {
      try {
        const id = event?.toolCallId ?? event?.id ?? event?.toolCall?.id;
        const name = event?.toolName ?? event?.name ?? event?.toolCall?.name ?? "tool";
        const args = event?.args ?? event?.arguments ?? event?.toolCall?.arguments;
        if (id) {
          addTool(
            state,
            {
              toolCallId: String(id),
              name: String(name),
              target: extractToolTarget(String(name), args),
              status: "running",
              startedAt: Date.now(),
            },
            MAX_TOOLS,
          );
        }
        // Skill detection: if the user/model invoked read on a SKILL.md path, record it
        if (String(name).toLowerCase() === "read" && args) {
          const path = (args as Record<string, unknown>)?.file_path ?? (args as Record<string, unknown>)?.path;
          if (typeof path === "string" && /SKILL\.md$/i.test(path)) {
            // Best-effort: derive skill name from path (parent directory basename)
            const match = path.match(/\/skills\/([^/]+)\//i);
            if (match) recordSkill(state, match[1]);
            else if (/([^/]+)\/SKILL\.md$/i.test(path)) {
              const m = path.match(/([^/]+)\/SKILL\.md$/i);
              if (m) recordSkill(state, m[1]);
            }
          }
        }
        gitSource.invalidate(); // file may have been modified
        scheduleRefresh(ctx);
      } catch (err) {
        debugLog("tool_execution_start error:", err);
      }
    });

    pi.on("tool_execution_end", (event: AnyEvent, ctx: AnyCtx) => {
      try {
        const id = event?.toolCallId ?? event?.id ?? event?.toolCall?.id;
        if (id) {
          const isError = Boolean(event?.isError ?? event?.error ?? event?.toolCall?.isError);
          updateToolStatus(state, String(id), isError ? "error" : "completed");
        }
        gitSource.invalidate();
        scheduleRefresh(ctx);
      } catch (err) {
        debugLog("tool_execution_end error:", err);
      }
    });

    // session_compact: increment compaction count
    pi.on("session_compact", (_event: AnyEvent, ctx: AnyCtx) => {
      try {
        state.compactionCount += 1;
        scheduleRefresh(ctx);
      } catch (err) {
        debugLog("session_compact error:", err);
      }
    });

    // session_shutdown: clear footer so we don't leak state into the next session before reload
    pi.on("session_shutdown", (_event: AnyEvent, ctx: AnyCtx) => {
      try {
        if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
        lastCtx = undefined;
        const ui = ctx?.ui ?? pi?.ui;
        if (ui && typeof ui.setFooter === "function") {
          ui.setFooter(undefined);
        }
      } catch {
        // best-effort
      }
    });

    // --- Slash command: /pi-hud:configure --------------------------------

    if (typeof pi.registerCommand === "function") {
      pi.registerCommand("configure", {
        description: "Configure pi-hud display options",
        handler: async (_args: unknown, ctx: AnyCtx) => {
          cfg = loadConfig(); // re-read in case the user edited the file
          const deps = ctxToDeps(ctx);
          cfg = await runConfigure(cfg, deps);
          // Force an immediate re-render with new config
          lastRenderedLines = [];
          await refreshFooter(ctx);
        },
      });
    }
  } catch (err) {
    // Top-level catch: log via console.error so the user sees something if they look.
    // pi itself swallows extension errors, but we want a breadcrumb.
    try {
      // eslint-disable-next-line no-console
      console.error("[pi-hud] load error:", err);
    } catch {
      // give up
    }
  }
}
