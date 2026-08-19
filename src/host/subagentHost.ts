/**
 * Subagent Host Bridge — create / run / cancel on the parent chat turn.
 *
 * Parent AgentLoop stays the normal host loop. Child work goes
 * SubagentRunner → createSubagentAgentLoopExecutor → a fresh AgentLoop
 * that reuses the parent's provider and timeline callbacks.
 */
import type { Mode } from '../agent/types';
import type { ToolOutput } from '../tools/types';
import { SubAgentResult } from '../tools/orchestration/SubAgentResult';
import {
  SubagentRunner,
  type SubagentEvent,
  type SubagentExecutor
} from '../agent/subagentRunner';
import {
  createSubagentAgentLoopExecutor,
  type SubagentAgentLoopOptions
} from '../agent/subagentAgentLoopExecutor';
import type { SubagentRole, SubagentTask } from '../agent/subagents';
import {
  bindWorktreeManager,
  type SubagentWorktreeBindings
} from '../agent/subagentWorktree';
import { WorktreeManager } from '../worktree/WorktreeManager';
import {
  applySubagentWorktree,
  rejectSubagentWorktree,
  reviewSubagentWorktree,
  type WorktreeApplyResult,
  type WorktreeReview
} from '../agent/subagentWorktreeReview';
import { getRegisteredSubagentWorktree } from './subagentWorktreeRegistry';

const MAX_CONCURRENT = 4;
const summarizer = new SubAgentResult();

export type SubagentHost = {
  create: (parentTurnId: string, prompt: string, role?: SubagentRole) => SubagentTask;
  run: (task: SubagentTask) => Promise<SubagentTask>;
  cancel: (taskId: string) => boolean;
  cancelAll: () => void;
  runFromToolArgs: (
    args: Record<string, unknown>,
    parentTurnId: string
  ) => Promise<ToolOutput>;
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
  maxConcurrent?: number;
  repoRoot?: string;
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
  if (raw === 'search' || raw === 'ask' || raw === 'explore' || raw === 'research') {
    return 'research';
  }
  if (raw === 'debug') return 'debug';
  if (raw === 'review') return 'review';
  if (raw === 'coding' || raw === 'shell' || raw === 'edit') return 'coding';
  return 'general';
}

export function modeForSubagentRole(role: SubagentRole): Mode {
  if (role === 'research') return 'ask';
  if (role === 'debug') return 'debug';
  return 'agent';
}

export function parentResultFromTask(task: SubagentTask): ToolOutput {
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
  const summary = summarizer.summarize({
    taskId: task.id,
    fullLog: [
      '## Summary',
      `- ${task.prompt.slice(0, 160)}`,
      task.result ? `Result: ${task.result}` : '',
      task.error ? `- error: ${task.error}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    toolCalls: 0,
    tokensUsed: { input: 0, output: 0 },
    duration,
    status: status === 'completed' ? 'completed' : 'error',
    error: task.error
  });

  return {
    success: task.status === 'completed',
    data: {
      taskId: task.id,
      parentTurnId: task.parentTurnId,
      role: task.role,
      status: task.status,
      summary: summary.summary,
      result: task.result,
      duration,
      filesChanged: task.worktreeSnapshot?.filesChanged,
      worktreePath: task.worktree?.path,
      worktreeBranch: task.worktree?.branch
    },
    error:
      task.status === 'completed'
        ? undefined
        : task.error || `Subagent ${task.status}`
  };
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
    duration: Math.max(0, durationMs)
  };
}

export function createSubagentHost(options: CreateSubagentHostOptions): SubagentHost {
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
      onToolResult: options.onToolResult
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
    worktrees
  });

  const created = new Map<string, SubagentTask>();
  let active = 0;

  const create = (
    parentTurnId: string,
    prompt: string,
    role: SubagentRole = 'general'
  ): SubagentTask => {
    const task = runner.create(parentTurnId, prompt, role);
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
  ): { repoRoot: string; worktree: NonNullable<SubagentTask['worktree']> } => {
    const registered = getRegisteredSubagentWorktree(taskId);
    if (registered) {
      return { repoRoot: registered.repoRoot, worktree: registered.worktree };
    }
    const task = created.get(taskId);
    if (!task) throw new Error(`Unknown subagent task: ${taskId}`);
    if (!task.worktree) throw new Error(`Subagent ${taskId} has no isolated worktree`);
    if (!repoRoot) throw new Error('Subagent worktree action requires a repository root');
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
        return { success: false, error: 'task_run requires prompt or description' };
      }
      if (active >= maxConcurrent) {
        return {
          success: false,
          error: `Too many concurrent subagents (max ${maxConcurrent})`
        };
      }
      const task = create(parentTurnId, prompt, roleFromTaskArgs(args));
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
    }
  };
}
