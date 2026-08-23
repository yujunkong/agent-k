/**
 * SUB-002 / 003 / 005 / 006 — SubagentRunner lifecycle owner.
 * Execution is injected (AgentLoop via createSubagentAgentLoopExecutor).
 */

import {
  applySubagentPatch,
  createSubagentTask,
  isTerminalSubagentStatus,
  type SubagentRole,
  type SubagentTask,
  type SubagentWorktree,
  type SubagentWorktreeBindings,
  type SubagentWorktreeSnapshot,
} from './subagents';

export interface SubagentExecutionContext {
  task: SubagentTask;
  signal: AbortSignal;
  worktree?: SubagentWorktree;
}

export type SubagentExecutor = (
  context: SubagentExecutionContext
) => Promise<string>;

export type SubagentEvent =
  | { type: 'subagent.created'; task: SubagentTask }
  | { type: 'subagent.started'; task: SubagentTask }
  | { type: 'subagent.completed'; task: SubagentTask }
  | { type: 'subagent.failed'; task: SubagentTask }
  | { type: 'subagent.cancelled'; task: SubagentTask };

export interface SubagentRunnerOptions {
  execute: SubagentExecutor;
  onEvent?: (event: SubagentEvent) => void;
  now?: () => number;
  /** SUB-014 — optional isolated worktree create/capture */
  worktrees?: SubagentWorktreeBindings;
}

/**
 * Runs one subagent task and owns only lifecycle transitions.
 */
export class SubagentRunner {
  private readonly execute: SubagentExecutor;
  private readonly onEvent?: (event: SubagentEvent) => void;
  private readonly now: () => number;
  private readonly worktrees?: SubagentWorktreeBindings;
  private readonly controllers = new Map<string, AbortController>();

  constructor(options: SubagentRunnerOptions) {
    this.execute = options.execute;
    this.onEvent = options.onEvent;
    this.now = options.now ?? Date.now;
    this.worktrees = options.worktrees;
  }

  create(
    parentTurnId: string,
    prompt: string,
    role: SubagentRole = 'general',
    description?: string
  ): SubagentTask {
    const task = createSubagentTask(
      parentTurnId,
      prompt,
      role,
      this.now(),
      description
    );
    this.onEvent?.({ type: 'subagent.created', task });
    return task;
  }

  async run(task: SubagentTask): Promise<SubagentTask> {
    if (isTerminalSubagentStatus(task.status)) return task;

    const controller = new AbortController();
    this.controllers.set(task.id, controller);

    let current = applySubagentPatch(task, {
      status: 'running',
      startedAt: this.now(),
    });
    this.onEvent?.({ type: 'subagent.started', task: current });

    let worktree: SubagentWorktree | undefined;
    try {
      if (this.worktrees) {
        worktree = await this.worktrees.create(task.id);
        if (!worktree?.path) {
          throw new Error(
            'Subagent refused: isolated worktree path is required'
          );
        }
      }

      const result = await this.execute({
        task: current,
        signal: controller.signal,
        worktree,
      });
      if (controller.signal.aborted) {
        current = applySubagentPatch(current, {
          status: 'cancelled',
          completedAt: this.now(),
          worktree,
        });
        this.onEvent?.({ type: 'subagent.cancelled', task: current });
        return current;
      }

      let worktreeSnapshot: SubagentWorktreeSnapshot | undefined;
      if (worktree && this.worktrees) {
        try {
          worktreeSnapshot = await this.worktrees.capture(worktree);
        } catch {
          worktreeSnapshot = { filesChanged: 0, files: [] };
        }
      }

      current = applySubagentPatch(current, {
        status: 'completed',
        completedAt: this.now(),
        result,
        worktree,
        worktreeSnapshot,
      });
      this.onEvent?.({ type: 'subagent.completed', task: current });
      return current;
    } catch (error) {
      if (controller.signal.aborted) {
        current = applySubagentPatch(current, {
          status: 'cancelled',
          completedAt: this.now(),
          worktree,
        });
        this.onEvent?.({ type: 'subagent.cancelled', task: current });
        return current;
      }

      current = applySubagentPatch(current, {
        status: 'failed',
        completedAt: this.now(),
        error: error instanceof Error ? error.message : String(error),
        worktree,
      });
      this.onEvent?.({ type: 'subagent.failed', task: current });
      return current;
    } finally {
      this.controllers.delete(task.id);
    }
  }

  /** SUB-006 */
  cancel(taskId: string): boolean {
    const controller = this.controllers.get(taskId);
    if (!controller) return false;
    controller.abort();
    return true;
  }
}
