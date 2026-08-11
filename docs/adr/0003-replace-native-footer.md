# pi-hud replaces pi's native footer rather than augmenting it

**Status**: accepted

Pi's built-in footer already shows cwd, session name, token usage, cost, context usage, and model. Rather than adding a widget above/below the editor (`ctx.ui.setWidget`) or appending status slots to the native footer (`ctx.ui.setStatus`), pi-hud calls `ctx.ui.setFooter(component)` to replace it entirely.

Replacement gives full control over layout, density, and ordering — necessary to match the claude-hud experience (multi-element, configurable, colored). Augmenting the native footer would split information across two areas and constrain layout to the slot API's shape.

The trade-off: the native footer's exact rendering is lost. Pi-hud re-presents all of its data points (model, context, tokens, cost) from the same in-memory sources, so no information is lost — only re-laid-out. A future v2 may add a config toggle to fall back to widget mode for users who want both.
