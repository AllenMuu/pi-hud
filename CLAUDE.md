# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

pi-hud is a **pi agent extension** (https://pi.dev/) — not a standalone app and not a Claude Code statusline. It loads in-process at agent boot via jiti, replaces pi's native footer via `ctx.ui.setFooter`, and renders a live HUD of session state (model, context usage, tokens/cost, tool activity, git, skills). It runs only in interactive TUI mode: `pi --mode json` and `pi --mode rpc` have no footer (`ctx.hasUI === false`), so the extension no-ops there.

**Terminology** (see `CONTEXT.md` — follow it to avoid Claude-Code-ism): say **HUD** (not "statusline"), **Footer** (not "status bar"), **pi extension** (not "plugin"), **Session JSONL** (not "transcript"). Pi has no Claude-Code-style external statusline API.

## Commands

No build step and no test framework are configured. Pi loads `./extension/index.ts` directly via jiti (ESM, `"type": "module"`), so `.ts` runs as source.

- **Typecheck**: `npx tsc` (tsconfig has `noEmit: true`; this is the only compilation check)
- **Install into pi (dev)**: `pi install git:/Users/allenj/work/AllenMuu/pi-hud` then `/reload` inside pi
- **Install from GitHub**: `pi install git:github.com/AllenMuu/pi-hud`
- **Debug**: `PI_HUD_DEBUG=1 pi` (prints `[pi-hud] ...` diagnostics to stderr)
- **Configure**: edit `~/.pi/agent/pi-hud/config.json`, or run `/pi-hud:configure` inside pi

There are currently no tests. The pure modules (`state.ts`, `config.ts`, `utils/format.ts`, `utils/width.ts`, `render/*`, the `parseStatus`/`findGitDir` exports of `sources/git.ts`) are designed to be testable without pi — plain inputs, plain outputs. `sources/context.ts` and `sources/session.ts` are the pi-coupled reflection boundary.

## Architecture

```
extension/
  index.ts          # entry: default-export factory piHudExtension(pi). Wires pi.on(...)
                    #   event subscriptions + the debounced render loop. Reload-safe
                    #   top-level try/catch so an extension error never crashes the agent.
  state.ts          # HudState (in-memory only, no persistence). Fresh per session.
  config.ts         # HudConfig schema + loadConfig/saveConfig + mergeConfig (clamps every field).
  sources/
    context.ts      # readModelInfo / readContextUsage / readAssistantUsage — probes ctx via reflection
    git.ts          # createGitSource(exec) — throttled (1/s) `git status -b --porcelain=v1` via pi.exec
    session.ts      # readSessionInfo — reads ctx.sessionManager for session start + name + leaf id
  render/
    index.ts        # render({state,cfg,git,width}) -> string[]  (picks expanded|compact)
    expanded.ts     # 5-line claude-hud-style layout
    compact.ts      # 2-line layout
    elements.ts     # per-element renderers (model, project+git, context, tokens, tools, ...)
    ansi.ts         # colorize / joinSegments / SYMBOLS / contextColor
  utils/
    format.ts       # token/cost/duration/percent/bar/path formatters (pure)
    width.ts        # visibleWidth / truncateToWidth — prefers @earendil-works/pi-tui, falls back to CJK-aware built-in
  commands/
    configure.ts    # /pi-hud:configure — interactive prompts via ctx.ui.select/confirm
docs/adr/           # 3 ADRs — read before architectural changes (see below)
```

### Data flow

`pi.on(event, handler)` fires → handler mutates `state` (HudState) → `scheduleRefresh(ctx)` debounces (100ms) → `refreshFooter` snapshots ctx + fetches git → `renderNow` calls `render()` → `ctx.ui.setFooter({ render: () => lines })`. `state` is the single source of truth; the renderer is pure (state + cfg + git + width → string[]).

### Critical invariants (do not break these)

1. **Never import pi types.** `AnyPi`/`AnyCtx`/`AnyEvent` are deliberately `any` (with eslint-disable). All pi API access is **defensive reflection** — probe each candidate field shape with `typeof` checks because pi's API shifts between versions (see `sources/context.ts` for the pattern). This keeps the extension standalone and testable.

2. **Never crash the agent.** Every event handler is wrapped in try/catch and logs via `debugLog`. Catch early so partial state never corrupts a render.

3. **Stale ctx throws on property access.** A `ctx` captured from a past event throws when you read its getters (e.g. `ctx.model`, `ctx.hasUI`) after the session has moved on. The render path guards this: `renderNow` probes `ctx.hasUI` in its own try/catch and bails if stale; `snapshotFromCtx` detects staleness by touching `ctx.model` first. **Never render from a timer using a captured ctx** — only re-render synchronously from event handlers where ctx is fresh. The `scheduleRefresh` timer only coalesces; it calls `refreshFooter(lastCtx)` which re-snapshots defensively.

4. **State is in-memory and per-session.** `createInitialState()` runs on every `session_start`. No transcript parsing, no disk caching, no IPC (ADR-0001). `session_shutdown` clears the footer so state doesn't leak into the next session before reload.

5. **Config lives at `~/.pi/agent/pi-hud/config.json`**, not inside the extension dir. The extension is distributed via `pi install git:...` which lands under `~/.pi/agent/git/pi-hud/` and would clobber config on update (ADR-0002). `mergeConfig` must clamp every field to a safe value — a malformed file falls back to defaults, never throws.

6. **Git source is throttled and non-repo-aware.** `createGitSource` caches for 1s, skips the subprocess entirely in non-git dirs (`.git` walk up to 20 levels), and is invalidated on `tool_execution_*` (files likely changed). It runs `git status -b --porcelain=v1` via `pi.exec` — never spawns git directly.

### ADRs (read before architectural changes)

- `docs/adr/0001-pi-extension-in-process.md` — in-process extension, not a subprocess. Rejected `pi --mode json`/`rpc` consumer shapes.
- `docs/adr/0002-config-location-independent.md` — config outside the git-managed extension tree.
- `docs/adr/0003-replace-native-footer.md` — `setFooter` *replaces* (not augments) pi's native footer; re-presents all its data from in-memory sources.

## Conventions

- ESM with `.js` import specifiers even in `.ts` source (jiti/node ESM resolution): `import { x } from "./state.js"`.
- Pure functions in `utils/` and `render/` take plain inputs and return strings — no `ctx`, no side effects. Keep pi-coupled code in `sources/` and `index.ts` only.
- Colors accept named presets (`red`, `brightBlue`, …), 256-color numbers (`208`), or hex (`#FF6600`) — resolved in `render/ansi.ts`.
- `language: "en"` is reserved in config; v1 is English-only.

## Commits

Commits made through the pi agent are auto-attributed by a `prepare-commit-msg`
hook (`.githooks/prepare-commit-msg`, enabled via `git config core.hooksPath
.githooks`). The hook detects pi-injected `PI_SESSION_ID` and appends a
`Co-Authored-By: pi <noreply@pi.dev>` trailer; manual commits in a normal shell
(no `PI_SESSION_ID`) are unaffected. It is idempotent (skips if the trailer is
already present).

- Normal `git commit` (incl. `-m`/`-F`): the hook adds the trailer - do not add
  it by hand (harmless if you do; the hook skips).
- `git commit --amend`: the hook does **not** fire, so add the trailer
  explicitly: `git commit --amend --no-edit --trailer "Co-Authored-By: pi <noreply@pi.dev>"`.
- After a fresh clone, enable the hook: `git config core.hooksPath .githooks`.
