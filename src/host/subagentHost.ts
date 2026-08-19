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
      duration
    },
    error:
      task.status === 'completed'
        ? undefined
        : task.error || `Subagent ${task.status}`
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

  const runner = new SubagentRunner({
    execute,
    onEvent: options.onLifecycle
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
    }
  };
}
