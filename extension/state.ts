// In-memory HUD state. Updated by event handlers, read by the renderer.
// No persistence: state starts empty on extension load and accumulates from there.
// See ADR-0001 for the rationale (in-process, event-driven, no replay).

export type ToolStatus = "running" | "completed" | "error";

export interface ToolEntry {
  toolCallId: string;
  name: string;
  target?: string; // file_path, pattern, command — best-effort extraction
  status: ToolStatus;
  startedAt: number;
  endedAt?: number;
}

export interface UsageSnapshot {
  // Token counts from the most recent AssistantMessage.usage
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  // Cumulative session cost in USD
  costInput?: number;
  costOutput?: number;
  costCacheRead?: number;
  costCacheWrite?: number;
  costTotal?: number;
  // When this snapshot was captured
  at: number;
}

export interface GitState {
  branch: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
  // Whether the cwd is a git repo at all
  isRepo: boolean;
}

export interface HudState {
  // Model + provider + thinking
  modelId?: string;
  modelName?: string;
  providerId?: string;
  thinkingLevel?: string;

  // Context window
  contextWindow?: number; // max tokens for the active model
  contextTokensUsed?: number; // current usage (from ctx.getContextUsage)

  // Latest usage snapshot
  usage?: UsageSnapshot;

  // Tool activity (most recent N; running ones always included)
  tools: ToolEntry[];

  // Session
  sessionStart: number; // ms epoch
  sessionName?: string;
  sessionLeafId?: string;
  compactionCount: number;

  // Active skills (names of skills whose SKILL.md was read this session)
  skills: Set<string>;

  // Context resources captured from before_agent_start's systemPromptOptions.
  // Paths only - file contents are sensitive and not needed for display.
  contextFilePaths?: string[];   // loaded AGENTS.md / CLAUDE.md / context files
  loadedSkillsCount?: number;    // all skills loaded into the system prompt
  selectedToolsCount?: number;   // tools available to the model this turn

  // Working directory (captured at session_start)
  cwd?: string;
}

export function createInitialState(): HudState {
  return {
    tools: [],
    skills: new Set(),
    compactionCount: 0,
    sessionStart: Date.now(),
  };
}

// Try to extract a "target" string from a tool's arguments (file_path, pattern, command, etc.)
// Best-effort: returns undefined if nothing useful is found.
export function extractToolTarget(name: string, args: Record<string, unknown> | undefined): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const candidates = [
    "file_path",
    "path",
    "pattern",
    "command",
    "query",
    "url",
    "description",
    "name",
  ];
  for (const key of candidates) {
    const v = (args as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export function addTool(
  state: HudState,
  entry: ToolEntry,
  maxTools = 20,
): void {
  state.tools.push(entry);
  // Keep at most maxTools, but never drop a running tool
  if (state.tools.length > maxTools) {
    state.tools = state.tools.filter((t) => t.status === "running").concat(
      state.tools.filter((t) => t.status !== "running").slice(-maxTools),
    );
  }
}

export function updateToolStatus(
  state: HudState,
  toolCallId: string,
  status: ToolStatus,
): void {
  const tool = state.tools.find((t) => t.toolCallId === toolCallId);
  if (!tool) return;
  tool.status = status;
  tool.endedAt = Date.now();
}

export function recordSkill(state: HudState, name: string): void {
  state.skills.add(name);
}
