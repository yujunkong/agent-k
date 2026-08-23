/**
 * HOST-011 / SUB-* — Subagent host: create / run / cancel + worktree review API.
 * Domain from `@agent-k/core`; isolation from `@agent-k/worktree`.
 */

import type { AgentMode } from '@agent-k/shared';
import {
  createSubagentAgentLoopExecutor,
  SubagentRunner,
  type SubagentAgentLoopOptions,
  type SubagentEvent,
  type SubagentExecutor,
  type SubagentRole,
  type SubagentTask,
} from '@agent-k/core';
import { SubAgentResult } from '@agent-k/tools';
import {
  applySubagentWorktree,
  bindWorktreeManager,
  rejectSubagentWorktree,
  reviewSubagentWorktree,
  WorktreeManager,
  type SubagentWorktreeBindings,
  type WorktreeApplyResult,
  type WorktreeReview,
} from '@agent-k/worktree';
import { getRegisteredSubagentWorktree } from './subagentWorktreeRegistry';

const MAX_CONCURRENT = 4;
const summarizer = new SubAgentResult();

/** Child loops share the parent AgentLoop; cap turns so they cannot auto-continue forever. */
export const SUBAGENT_MAX_TURNS = 8;

/** Tool-shaped result returned to the parent AgentLoop. */
export type SubagentToolOutput = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

export type SubagentHost = {
  create: (
    parentTurnId: string,
    prompt: string,
    role?: SubagentRole,
    description?: string
  ) => SubagentTask;
  run: (task: SubagentTask) => Promise<SubagentTask>;
  cancel: (taskId: string) => boolean;
  cancelAll: () => void;
  runFromToolArgs: (
    args: Record<string, unknown>,
    parentTurnId: string
  ) => Promise<SubagentToolOutput>;
  reviewWorktree: (taskId: string) => WorktreeReview;
  applyWorktree: (taskId: string) => Promise<WorktreeApplyResult>;
  rejectWorktree: (taskId: string) => Promise<void>;
};

export type CreateSubagentHostOptions = {
  systemPrompt: string;
  createLoop: SubagentAgentLoopOptions['createLoop'];
  buildMessages?: SubagentAgentLoopOptions['buildMessages'];
  execute?: SubagentExecutor;
  onLifecycle?: (event: SubagentEvent) => void;
  onDelta?: SubagentAgentLoopOptions['onDelta'];
  onReasoning?: SubagentAgentLoopOptions['onReasoning'];
  onToolCall?: SubagentAgentLoopOptions['onToolCall'];
  onToolResult?: SubagentAgentLoopOptions['onToolResult'];
  onToolCallsBegin?: SubagentAgentLoopOptions['onToolCallsBegin'];
  maxConcurrent?: number;
  repoRoot?: string;
  /** SUB-014 — defaults to bindWorktreeManager when repoRoot set */
  worktrees?: SubagentWorktreeBindings;
};

export function promptFromTaskArgs(args: Record<string, unknown>): string {
  const prompt = String(args.prompt ?? args.task ?? '').trim();
  const description = String(args.description ?? '').trim();
  const subtasks = Array.isArray(args.subtasks)
    ? args.subtasks.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const body = prompt || description;
  if (!body) return '';
  if (!subtasks.length) return body;
  return `${body}\n\nSubtasks:\n- ${subtasks.join('\n- ')}`;
}

export function roleFromTaskArgs(args: Record<string, unknown>): SubagentRole {
  const raw = String(
    args.subagent_type ?? args.role ?? args.type ?? args.mode ?? 'general'
  )
    .trim()
    .toLowerCase();
  if (
    raw === 'search' ||
    raw === 'ask' ||
    raw === 'explore' ||
    raw === 'research' ||
    raw === 'explorer'
  ) {
    return 'research';
  }
  if (raw === 'debug') return 'debug';
  if (raw === 'review') return 'review';
  if (raw === 'coding' || raw === 'shell' || raw === 'edit') return 'coding';
  return 'general';
}

export function modeForSubagentRole(role: SubagentRole): AgentMode {
  if (role === 'research') return 'ask';
  if (role === 'debug') return 'debug';
  return 'agent';
}

export function parentResultFromTask(task: SubagentTask): SubagentToolOutput {
  const duration = Math.max(
    0,
    (task.completedAt ?? Date.now()) - (task.startedAt ?? task.createdAt)
  );
  const status =
    task.status === 'completed'
      ? 'completed'
      : task.status === 'cancelled'
        ? 'cancelled'
        : 'error';
  // Comment: SUB-010 — parent LLM must receive the child conclusion verbatim.
  // Prefer task.result; only fall back to short auto-summary when empty.
  const fullResult = String(task.result || '').trim();
  const fallback = summarizer.summarize({
    taskId: task.id,
    fullLog: [
      '## Summary',
      `- ${task.prompt.slice(0, 160)}`,
      task.error ? `- error: ${task.error}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    toolCalls: 0,
    tokensUsed: { input: 0, output: 0 },
    duration,
    status: status === 'completed' ? 'completed' : 'error',
    error: task.error,
  });
  // Comment: never 12k-slice the conclusion — models overweight `summary` and
  // ignore a parallel `result` field, then judge from a truncated stub.
  const conclusion =
    fullResult || String(fallback.summary || task.error || '').trim();
  const parentToolText = formatParentSubagentToolText({
    role: task.role,
    status: task.status,
    durationMs: duration,
    filesChanged: task.worktreeSnapshot?.filesChanged,
    worktreePath: task.worktree?.path,
    worktreeBranch: task.worktree?.branch,
    conclusion,
    error: task.error,
    emptyHint: fullResult
      ? undefined
      : `Child left no final answer. Prompt was: ${task.prompt.slice(0, 240)}`,
  });

  return {
    success: task.status === 'completed',
    data: {
      taskId: task.id,
      parentTurnId: task.parentTurnId,
      role: task.role,
      status: task.status,
      summary: conclusion,
      result: conclusion || undefined,
      parentToolText,
      duration,
      filesChanged: task.worktreeSnapshot?.filesChanged,
      worktreePath: task.worktree?.path,
      worktreeBranch: task.worktree?.branch,
    },
    error:
      task.status === 'completed'
        ? undefined
        : task.error || `Subagent ${task.status}`,
  };
}

/** Plain-text tool body for the parent AgentLoop (not JSON the model skims). */
export function formatParentSubagentToolText(opts: {
  role?: string;
  status?: string;
  durationMs?: number;
  filesChanged?: number;
  worktreePath?: string;
  worktreeBranch?: string;
  conclusion: string;
  error?: string;
  emptyHint?: string;
}): string {
  const head = [
    `Subagent (${opts.role || 'general'}) · ${opts.status || 'unknown'}`,
    typeof opts.durationMs === 'number'
      ? `durationMs: ${opts.durationMs}`
      : undefined,
    typeof opts.filesChanged === 'number'
      ? `filesChanged: ${opts.filesChanged}`
      : undefined,
    opts.worktreePath ? `worktree: ${opts.worktreePath}` : undefined,
    opts.worktreeBranch ? `branch: ${opts.worktreeBranch}` : undefined,
    opts.error ? `error: ${opts.error}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
  const body =
    String(opts.conclusion || '').trim() ||
    String(opts.emptyHint || 'Subagent returned an empty conclusion.').trim();
  return `${head}\n\n---\n${body}`;
}

export type SubagentRunStats = {
  toolCount: number;
  files: Set<string>;
};

export function createSubagentRunStats(): SubagentRunStats {
  return { toolCount: 0, files: new Set() };
}

export function recordSubagentTool(stats: SubagentRunStats): void {
  stats.toolCount += 1;
}

export function recordSubagentFileChange(
  stats: SubagentRunStats,
  path?: string
): void {
  const value = String(path || '').trim();
  if (value) stats.files.add(value);
}

export function snapshotSubagentResultStats(
  stats: SubagentRunStats | undefined,
  durationMs: number
): { filesChanged: number; toolCount: number; duration: number } {
  return {
    filesChanged: stats?.files.size ?? 0,
    toolCount: stats?.toolCount ?? 0,
    duration: Math.max(0, durationMs),
  };
}

/** Real factory — wires Runner + AgentLoop executor + optional worktree (SUB-014). */
export function createSubagentHost(
  options: CreateSubagentHostOptions
): SubagentHost {
  const maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT;
  const execute =
    options.execute ??
    createSubagentAgentLoopExecutor({
      createLoop: options.createLoop,
      systemPrompt: options.systemPrompt,
      buildMessages: options.buildMessages,
      onDelta: options.onDelta,
      onReasoning: options.onReasoning,
      onToolCall: options.onToolCall,
      onToolResult: options.onToolResult,
      onToolCallsBegin: options.onToolCallsBegin,
    });

  const repoRoot = options.repoRoot;
  const worktrees =
    options.worktrees ??
    (repoRoot
      ? bindWorktreeManager(new WorktreeManager(repoRoot), repoRoot)
      : undefined);

  const runner = new SubagentRunner({
    execute,
    onEvent: options.onLifecycle,
    worktrees,
  });

  const created = new Map<string, SubagentTask>();
  let active = 0;

  const create = (
    parentTurnId: string,
    prompt: string,
    role: SubagentRole = 'general',
    description?: string
  ): SubagentTask => {
    const task = runner.create(parentTurnId, prompt, role, description);
    created.set(task.id, task);
    return task;
  };

  const run = async (task: SubagentTask): Promise<SubagentTask> => {
    active += 1;
    try {
      const finished = await runner.run(task);
      created.set(finished.id, finished);
      return finished;
    } finally {
      active = Math.max(0, active - 1);
    }
  };

  const cancel = (taskId: string): boolean => runner.cancel(taskId);

  const cancelAll = (): void => {
    for (const id of created.keys()) runner.cancel(id);
  };

  const taskForWorktreeAction = (
    taskId: string
  ): {
    repoRoot: string;
    worktree: NonNullable<SubagentTask['worktree']>;
  } => {
    const registered = getRegisteredSubagentWorktree(taskId);
    if (registered) {
      return { repoRoot: registered.repoRoot, worktree: registered.worktree };
    }
    const task = created.get(taskId);
    if (!task) throw new Error(`Unknown subagent task: ${taskId}`);
    if (!task.worktree) {
      throw new Error(`Subagent ${taskId} has no isolated worktree`);
    }
    if (!repoRoot) {
      throw new Error('Subagent worktree action requires a repository root');
    }
    return { repoRoot, worktree: task.worktree };
  };

  return {
    create,
    run,
    cancel,
    cancelAll,
    runFromToolArgs: async (args, parentTurnId) => {
      const prompt = promptFromTaskArgs(args);
      if (!prompt) {
        return {
          success: false,
          error: 'task_run requires prompt or description',
        };
      }
      if (active >= maxConcurrent) {
        return {
          success: false,
          error: `Too many concurrent subagents (max ${maxConcurrent})`,
        };
      }
      const description =
        String(args.description ?? '').trim() || undefined;
      const task = create(
        parentTurnId,
        prompt,
        roleFromTaskArgs(args),
        description
      );
      const finished = await run(task);
      return parentResultFromTask(finished);
    },
    reviewWorktree: (taskId) => {
      const { repoRoot: root, worktree } = taskForWorktreeAction(taskId);
      return reviewSubagentWorktree(root, worktree);
    },
    applyWorktree: async (taskId) => {
      const { repoRoot: root, worktree } = taskForWorktreeAction(taskId);
      return applySubagentWorktree(root, worktree);
    },
    rejectWorktree: async (taskId) => {
      const { repoRoot: root, worktree } = taskForWorktreeAction(taskId);
      await rejectSubagentWorktree(root, worktree);
      const task = created.get(taskId);
      if (task) created.set(task.id, { ...task, worktree: undefined });
    },
  };
}
