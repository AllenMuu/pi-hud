# pi-hud is a pi extension, not an external subprocess

**Status**: accepted

Pi has no Claude-Code-style external statusline API (stdin JSON → command → stdout). The three integration paths were: (a) a pi extension loaded in-process via jiti, rendering through `ctx.ui.setFooter`; (b) an external subprocess consuming `pi --mode json` event stream; (c) driving pi via `pi --mode rpc`. We chose (a).

The extension runs in-process with zero IPC overhead, gets live data from `ctx.getContextUsage()` / `ctx.model` / event subscriptions, and renders by replacing pi's native footer — the same mechanism pi's own footer uses. The trade-off: it only displays in interactive TUI mode; `pi --mode json` and `pi --mode rpc` sessions have no visible footer (`ctx.hasUI === false`), so the extension no-ops there. For HUD purposes that is acceptable — those modes are programmatic, not human-watched.

Rejected (b) and (c) would have produced a "separate terminal panel" product shape, diverging from the claude-hud "always visible below your input" experience that motivated this project.
