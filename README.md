# pi-hud

A real-time status HUD for the [pi agent](https://pi.dev/). Loaded as a pi extension in-process, it replaces pi's native footer with a compact, always-visible summary of session state.

## What you see

Default expanded layout (two lines):

```
[glm-5.2 │ ark │ medium] │ pi-hud git:(main*) ⏱5m ⊗2 ▸main
██████░░░░ 45% (460k/1024k) │ ↑12k ↓3k R8k W1k $0.02 │ ⚡ui,tdd │ ◐ Edit: auth.ts | ✓ Read ×3
```

- **Model + provider + thinking level** — `[glm-5.2 │ ark │ medium]`
- **Project path + git branch** — `pi-hud git:(main*)`
- **Context bar** — scaled to the active model's window (e.g. 1024k for `glm-5.2`)
- **Token usage + cost** — `↑12k ↓3k R8k W1k $0.02` from `AssistantMessage.usage`
- **Tool activity** — most recent N tools with status and target
- **Session duration, compaction count, session name/branch**
- **Active skills** — detected from `read` calls on `SKILL.md` paths

Compact layout (single line):

```
[glm-5.2] pi-hud git:(main*) Ctx 45% ↑12k↓3k ◐Edit:auth.ts ⏱5m
```

## Install

### From a local git checkout (development)

```bash
cd /Users/allenj/work/AllenMuu/pi-hud
git init && git add -A && git commit -m "init"
pi install git:/Users/allenj/work/AllenMuu/pi-hud
```

To pick up code changes, re-run `pi install git:...` then `/reload` inside pi.

### From GitHub

```bash
pi install git:github.com/AllenMuu/pi-hud
```

Then run `/reload` inside pi (or start a new session).

## Configure

Edit `~/.pi/agent/pi-hud/config.json`, or run the slash command:

```
/pi-hud:configure
```

The command walks you through layout, context value format, token format, and per-element toggles via interactive prompts.

### Default config

```jsonc
{
  "language": "en",
  "lineLayout": "expanded",        // expanded | compact
  "pathLevels": 1,                 // 1 | 2 | 3 | full
  "elementOrder": ["model","project","git","duration","compactions","session","context","tokens","skills","tools"],
  "display": {
    "showModel": true, "showProvider": true, "showThinkingLevel": true,
    "showProject": true,
    "showGit": true, "gitShowDirty": true, "gitShowAheadBehind": false,
    "showContextBar": true, "contextValue": "both",   // percent | tokens | both
    "showTokens": true, "tokenFormat": "short",       // short | long
    "showCost": true,
    "showTools": true, "toolsMaxVisible": 4, "toolNameMaxLength": 20,
    "showDuration": true,
    "showCompactions": true,        // hidden until first compaction
    "showSessionName": true,
    "showSkills": true
  },
  "colors": {
    "model": "cyan", "project": "yellow", "git": "magenta", "gitBranch": "cyan",
    "context": "green", "warning": "yellow", "critical": "red",
    "tokens": "brightBlue", "cost": "green", "label": "dim",
    "barFilled": "█", "barEmpty": "░"
  },
  "thresholds": { "contextWarning": 70, "contextCritical": 85 }
}
```

Color values accept named presets (`red`, `brightBlue`, …), 256-color numbers (`208`), or hex (`#FF6600`).

## How it works

pi-hud is a pi extension loaded at agent boot via jiti. It subscribes to pi events (`session_start`, `message_end`, `tool_execution_*`, `session_compact`, `model_select`, …) and renders through `ctx.ui.setFooter`. State is in-memory only — no transcript parsing, no caching, no IPC. See [docs/adr/0001-pi-extension-in-process.md](./docs/adr/0001-pi-extension-in-process.md).

It only renders in interactive TUI mode. `pi --mode json` and `pi --mode rpc` sessions have no visible footer, so the extension no-ops there.

## Debug

Set `PI_HUD_DEBUG=1` to print diagnostics to stderr:

```bash
PI_HUD_DEBUG=1 pi
```

## License

MIT
