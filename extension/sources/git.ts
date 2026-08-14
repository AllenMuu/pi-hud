// Git status source: throttled pi.exec wrapper.
// Runs `git status` at most once per second; returns cached result otherwise.
// Non-git directories are detected via .git existence and skip the subprocess entirely.

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { GitState } from "../state.js";

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

type ExecFn = (cmd: string, args: string[], opts?: { signal?: AbortSignal; timeout?: number }) => Promise<ExecResult>;

interface CacheEntry {
  state: GitState;
  at: number;
}

const NON_REPO: GitState = {
  branch: null,
  dirty: false,
  ahead: 0,
  behind: 0,
  isRepo: false,
};

const MIN_INTERVAL_MS = 1000;
const EXEC_TIMEOUT_MS = 5000;

function findGitDir(cwd: string): string | null {
  let dir = cwd;
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

// Parse `git status -b --porcelain=v1` output.
function parseStatus(out: string): { branch: string | null; dirty: boolean; ahead: number; behind: number } {
  const lines = out.split("\n").filter(Boolean);
  if (lines.length === 0) return { branch: null, dirty: false, ahead: 0, behind: 0 };

  const head = lines[0];
  // Format: "## branch...origin/branch [ahead N, behind N]"
  const branchMatch = head.match(/^## (.+?)(?:\.\.\.(.+?))?(?:\s+\[(.+?)\])?$/);
  let branch: string | null = null;
  let ahead = 0;
  let behind = 0;
  if (branchMatch) {
    const ref = branchMatch[1];
    // Strip "HEAD (no branch)" -> detached HEAD
    if (ref === "HEAD (no branch)") {
      branch = "HEAD";
    } else {
      branch = ref;
    }
    const meta = branchMatch[3];
    if (meta) {
      const aheadMatch = meta.match(/ahead (\d+)/);
      const behindMatch = meta.match(/behind (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch) behind = parseInt(behindMatch[1], 10);
    }
  }

  // Any line starting with " ??" / " M" / etc. (not "##") means dirty
  const dirty = lines.some((l) => !l.startsWith("## ") && l.trim().length >= 2);
  return { branch, dirty, ahead, behind };
}

export function createGitSource(exec: ExecFn) {
  let cache: CacheEntry | null = null;
  // In-flight promise: dedups concurrent refresh() calls so we never spawn
  // more than one `git status` subprocess for a burst of events. Satisfies
  // the "at most once per second" invariant in CLAUDE.md #6.
  let pending: Promise<GitState> | null = null;

  async function refresh(cwd: string): Promise<GitState> {
    const gitDir = findGitDir(cwd);
    if (!gitDir) {
      cache = { state: NON_REPO, at: Date.now() };
      return cache.state;
    }

    try {
      // -b: branch info, --porcelain: stable format, v1
      const result = await exec("git", ["-C", gitDir, "status", "-b", "--porcelain=v1"], {
        timeout: EXEC_TIMEOUT_MS,
      });
      // Defensive reflection: pi.exec's return shape may shift across versions
      // (code | exitCode | status). Match the pattern used in sources/context.ts.
      const r = result as unknown as Record<string, unknown>;
      const code =
        typeof r.code === "number" ? r.code :
        typeof r.exitCode === "number" ? r.exitCode :
        typeof r.status === "number" ? r.status :
        0;
      const stdout = typeof r.stdout === "string" ? r.stdout : "";
      if (code !== 0) {
        // git error (e.g. corrupt repo): treat as non-repo
        cache = { state: { ...NON_REPO, isRepo: true }, at: Date.now() };
        return cache.state;
      }
      const parsed = parseStatus(stdout);
      const state: GitState = {
        branch: parsed.branch,
        dirty: parsed.dirty,
        ahead: parsed.ahead,
        behind: parsed.behind,
        isRepo: true,
      };
      cache = { state, at: Date.now() };
      return state;
    } catch {
      // exec failure: keep last good cache if fresh, else non-repo
      if (cache && Date.now() - cache.at < MIN_INTERVAL_MS * 5) return cache.state;
      cache = { state: NON_REPO, at: Date.now() };
      return cache.state;
    }
  }

  return {
    async get(cwd: string): Promise<GitState> {
      const now = Date.now();
      if (cache && now - cache.at < MIN_INTERVAL_MS) {
        return cache.state;
      }
      // Coalesce concurrent callers onto a single in-flight refresh.
      if (pending) return pending;
      pending = refresh(cwd).finally(() => { pending = null; });
      return pending;
    },
    // Force-invalidate cache (e.g. after a tool that likely modified files).
    // Does NOT cancel an in-flight refresh — that would just cause the next
    // get() to spawn another subprocess.
    invalidate(): void {
      cache = null;
    },
  };
}

// Exported for tests
export { parseStatus, findGitDir };
