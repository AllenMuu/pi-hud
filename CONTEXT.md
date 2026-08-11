# pi-hud

A real-time status HUD for the [pi agent](https://pi.dev/), rendered as a replacement for pi's native footer. Loaded as a pi extension in-process, it subscribes to agent events and renders a compact, always-visible summary of session state below the editor.

## Language

**HUD**:
The status display rendered by pi-hud. Replaces pi's native footer.
_Avoid_: statusline (pi has no statusline API; the term is misleading here)

**Footer**:
The single-line status area at the bottom of pi's TUI. Pi-hud replaces it via `ctx.ui.setFooter(component)`.
_Avoid_: status bar, status line

**pi Extension**:
A TypeScript module loaded by pi at agent boot via jiti, exposing a default-export factory that receives the `ExtensionAPI`. Runs in-process with full system permissions.
_Avoid_: plugin (pi uses "extension"; "plugin" is Claude Code terminology)

**Session JSONL**:
The append-only transcript file at `~/.pi/agent/sessions/--<cwd>--/<timestamp>_<uuid>.jsonl`. Tree-structured via `id`/`parentId`. Pi-hud reads session header timestamp from it via `ctx.sessionManager`.
_Avoid_: transcript (overloaded; pi calls it "session file")

**Active Tool**:
A tool whose `tool_execution_start` fired without a matching `tool_execution_end`. At most a handful concurrent; pi-hud shows the most recent N with completion status.
_Avoid_: running tool, pending tool call

**Compaction Count**:
Number of `session_compact` events since session start. Manual (`/compact`) or auto-threshold. Rendered as `⊗ N`, hidden until the first compaction.
_Avoid_: compact count, summarization count

**Active Skill**:
A skill whose `SKILL.md` was loaded via the `read` tool during the current session. Detected by filtering `tool_execution_*` events for `read` calls whose path matches a skill file. Pi has no model-callable `Skill` tool.
_Avoid_: loaded skill, invoked skill

**Context Window**:
The model's maximum token capacity. Read from `ctx.model.context` (e.g. `glm-5.2` = 1024000). Used to scale the context bar.
_Avoid_: token limit, context size

**Thinking Level**:
The model's reasoning depth setting (`low | medium | high | ultracode`). Read from `ctx.thinkingLevel`. Rendered in the model badge.
_Avoid_: effort level (Claude Code term), reasoning effort
