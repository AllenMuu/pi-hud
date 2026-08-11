// Session source: reads session header timestamp + session name from pi's ctx.sessionManager.
// All access is defensive — field shapes may vary across pi versions.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

export interface SessionInfo {
  sessionStart?: number; // ms epoch
  sessionName?: string;
  leafId?: string;
}

// Extract the session start timestamp from the session JSONL header.
// Known shape: SessionManager.getSessionFile() returns the path; the first line of the
// JSONL is { "type": "session", "timestamp": "ISO-8601", ... }.
// We also try ctx.sessionManager.getSessionId() / .getLeafId() for the leaf id.
export function readSessionInfo(ctx: AnyCtx): SessionInfo {
  const out: SessionInfo = {};
  try {
    const sm = ctx?.sessionManager;
    if (!sm || typeof sm !== "object") return out;

    // Leaf id
    if (typeof sm.getLeafId === "function") {
      const id = sm.getLeafId();
      if (typeof id === "string") out.leafId = id;
    } else if (typeof sm.leafId === "string") {
      out.leafId = sm.leafId;
    }

    // Session name
    if (typeof sm.getSessionName === "function") {
      const name = sm.getSessionName();
      if (typeof name === "string" && name.length > 0) out.sessionName = name;
    } else if (typeof sm.sessionName === "string") {
      out.sessionName = sm.sessionName;
    }

    // Session start: try getEntries() first line's timestamp
    if (typeof sm.getEntries === "function") {
      try {
        const entries = sm.getEntries();
        if (Array.isArray(entries) && entries.length > 0) {
          const first = entries[0];
          if (first && typeof first === "object") {
            const ts = first.timestamp;
            if (typeof ts === "string") {
              const ms = Date.parse(ts);
              if (!Number.isNaN(ms)) out.sessionStart = ms;
            } else if (typeof ts === "number") {
              // Pi timestamps are ISO strings, but be defensive
              out.sessionStart = ts > 1e12 ? ts : ts * 1000;
            }
          }
        }
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort
  }
  return out;
}

// Extract session name from a `session_info_changed` event payload.
export function readSessionNameFromEvent(event: AnyCtx): string | undefined {
  try {
    const name = event?.name;
    if (typeof name === "string" && name.length > 0) return name;
    // Some events nest under event.sessionInfo
    const info = event?.sessionInfo;
    if (info && typeof info === "object" && typeof info.name === "string") return info.name;
    return undefined;
  } catch {
    return undefined;
  }
}
