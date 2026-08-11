// Context + model + usage source: reads from the pi extension ctx object.
// All pi extension APIs are accessed via reflection here so this module
// doesn't import pi types directly (keeps it standalone, testable).
// Field names are probed defensively — pi's API may shift between versions.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

export interface ModelInfo {
  modelId?: string;
  modelName?: string;
  providerId?: string;
  thinkingLevel?: string;
  contextWindow?: number;
}

export interface ContextUsage {
  tokensUsed?: number;
  // Pi's getContextUsage may or may not expose the window size; we fall back to ctx.model
  windowSize?: number;
}

// Probe ctx.model for the active model + context window.
// Known field shapes (from pi docs/research):
//   - ctx.model.id / ctx.model.name / ctx.model.context
//   - ctx.thinkingLevel (string)
//   - ctx.model.provider / ctx.model.providerId
// We probe each candidate defensively.
export function readModelInfo(ctx: AnyCtx): ModelInfo {
  const info: ModelInfo = {};
  try {
    const model = ctx?.model;
    if (model && typeof model === "object") {
      info.modelId = typeof model.id === "string" ? model.id : undefined;
      info.modelName =
        typeof model.name === "string" ? model.name :
        typeof model.display_name === "string" ? model.display_name :
        info.modelId;
      info.providerId =
        typeof model.provider === "string" ? model.provider :
        typeof model.providerId === "string" ? model.providerId :
        undefined;
      // Context window: try .context, .contextWindow, .maxTokens
      info.contextWindow =
        typeof model.context === "number" ? model.context :
        typeof model.contextWindow === "number" ? model.contextWindow :
        typeof model.maxTokens === "number" ? model.maxTokens :
        typeof model.context_window === "number" ? model.context_window :
        undefined;
    }
    const tl = ctx?.thinkingLevel;
    if (typeof tl === "string") info.thinkingLevel = tl;
    else if (tl && typeof tl === "object" && typeof tl.level === "string") info.thinkingLevel = tl.level;
  } catch {
    // Best-effort; return whatever we got
  }
  return info;
}

// Probe ctx.getContextUsage() for current token usage.
export function readContextUsage(ctx: AnyCtx): ContextUsage {
  const out: ContextUsage = {};
  try {
    const fn = ctx?.getContextUsage;
    if (typeof fn !== "function") return out;
    const result = fn.call(ctx);
    // May be a Promise or a sync object; normalize to sync if possible
    const sync = result && typeof result.then === "function" ? undefined : result;
    if (sync && typeof sync === "object") {
      out.tokensUsed =
        typeof sync.tokens === "number" ? sync.tokens :
        typeof sync.used === "number" ? sync.used :
        typeof sync.totalTokens === "number" ? sync.totalTokens :
        undefined;
      out.windowSize =
        typeof sync.windowSize === "number" ? sync.windowSize :
        typeof sync.contextWindow === "number" ? sync.contextWindow :
        undefined;
    }
  } catch {
    // Best-effort
  }
  return out;
}

// Probe an AssistantMessage for usage data.
// Shape per pi docs: { usage: { input, output, cacheRead, cacheWrite, totalTokens, cost: { input, output, cacheRead, cacheWrite, total } } }
export interface UsageData {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  costInput?: number;
  costOutput?: number;
  costCacheRead?: number;
  costCacheWrite?: number;
  costTotal?: number;
}

export function readAssistantUsage(message: AnyCtx): UsageData | undefined {
  try {
    const usage = message?.usage;
    if (!usage || typeof usage !== "object") return undefined;
    const cost = usage.cost && typeof usage.cost === "object" ? usage.cost : {};
    return {
      input: typeof usage.input === "number" ? usage.input : undefined,
      output: typeof usage.output === "number" ? usage.output : undefined,
      cacheRead: typeof usage.cacheRead === "number" ? usage.cacheRead : undefined,
      cacheWrite: typeof usage.cacheWrite === "number" ? usage.cacheWrite : undefined,
      totalTokens: typeof usage.totalTokens === "number" ? usage.totalTokens : undefined,
      costInput: typeof cost.input === "number" ? cost.input : undefined,
      costOutput: typeof cost.output === "number" ? cost.output : undefined,
      costCacheRead: typeof cost.cacheRead === "number" ? cost.cacheRead : undefined,
      costCacheWrite: typeof cost.cacheWrite === "number" ? cost.cacheWrite : undefined,
      costTotal: typeof cost.total === "number" ? cost.total : undefined,
    };
  } catch {
    return undefined;
  }
}

// Probe a before_agent_start event's systemPromptOptions for loaded context
// resources: context files (AGENTS.md / CLAUDE.md / etc.), skills, and tools.
// Returns paths/counts only - never content (which is sensitive). Each field
// is left undefined when the shape isn't recognized, so the renderer hides it.
export interface ContextResources {
  contextFilePaths?: string[];
  loadedSkillsCount?: number;
  selectedToolsCount?: number;
}

export function readContextResources(opts: AnyCtx): ContextResources {
  const out: ContextResources = {};
  try {
    if (!opts || typeof opts !== "object") return out;

    const files = opts.contextFiles;
    if (Array.isArray(files)) {
      out.contextFilePaths = files
        .map((f: AnyCtx) =>
          f && typeof f === "object" && typeof f.path === "string" ? f.path : undefined,
        )
        .filter((p: unknown): p is string => typeof p === "string");
    }

    const skills = opts.skills;
    if (Array.isArray(skills)) out.loadedSkillsCount = skills.length;

    const tools = opts.selectedTools;
    if (Array.isArray(tools)) out.selectedToolsCount = tools.length;
  } catch {
    // best-effort
  }
  return out;
}
