# Config lives at ~/.pi/agent/pi-hud/config.json, not inside the extension directory

**Status**: accepted

Pi extensions are typically configured via project-local `.pi/` files or files dropped into the extension's own directory. We deliberately place pi-hud's config at `~/.pi/agent/pi-hud/config.json` — a directory independent of the extension code.

The reason: pi-hud is distributed as a pi package via `pi install git:...`, which lands under `~/.pi/agent/git/pi-hud/`. Updates re-fetch the repo and would clobber any user config stored inside it. A standalone directory survives package updates, holds user customizations (colors, layout, toggles) persistently, and stays writable without permission contention with the git-managed extension tree.

This deviates from pi's `.pi/` convention, which is surprising. The deviation is deliberate: pi's convention assumes project-local configuration, but HUD preferences are per-user, not per-project.
