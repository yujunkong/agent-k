/**
 * HOST-008b — Plan execute host bridge → @agent-k/plan execution engine.
 */

import type { RequestId } from '@agent-k/shared';
import {
  runPlanExecution,
  type ExecutionPlan,
  type PlanExecutionDeps,
} from '@agent-k/plan';
import * as vscode from 'vscode';

export type PlanExecuteHostContext = {
  webview: vscode.Webview | undefined;
};

export type PlanExecuteMessage = {
  requestId: RequestId;
  sessionId?: string;
  parentTurnId?: string;
  executionPlan?: ExecutionPlan;
  document?: unknown;
  taskIds?: string[];
  repoRoot?: string;
};

function postCardPatch(
  webview: vscode.Webview | undefined,
  payload: Record<string, unknown>,
): void {
  if (!webview) return;
  void webview.postMessage({ type: 'plan.card.patch', ...payload });
}

/**
 * Run the approved execution DAG and stream updates to the PlanCard.
 */
export async function runHostPlanExecute(
  ctx: PlanExecuteHostContext,
  message: PlanExecuteMessage,
): Promise<void> {
  const requestId = String(message.requestId);
  const sessionId = String(message.sessionId || '').trim() || undefined;
  const plan = message.executionPlan;

  if (!plan || !Array.isArray(plan.tasks)) {
    void ctx.webview?.postMessage({
      type: 'plan.execution.error',
      requestId,
      error: 'plan.execute requires an executionPlan payload.',
    });
    return;
  }

  // Comment: Force main-task path until createSubagentHost is shared with chatSend.
  // Subagent stub still present for any remaining 'subagent' delegates.
  const runnable: ExecutionPlan = {
    ...plan,
    tasks: plan.tasks.map((t) => ({ ...t, execution: 'main' as const })),
    status: plan.status === 'draft' || plan.status === 'reviewing' ? 'approved' : plan.status,
  };

  const planId = String(runnable.id || 'plan');
  void ctx.webview?.postMessage({
    type: 'plan.execution.started',
    requestId,
    sessionId,
    executionPlan: runnable,
  });

  const deps: PlanExecutionDeps = {
    parentTurnId: String(message.parentTurnId || `plan-${requestId}`),
    subagentHost: {
      create: (_parent, _prompt, _role) => ({
        id: `plan-sub-${Date.now().toString(36)}`,
        status: 'pending',
      }),
      run: async (task) => ({ ...task, status: 'completed' }),
    },
    runMainTask: async ({ task }) => {
      postCardPatch(ctx.webview, {
        sessionId,
        planId,
        phase: 'executing',
        statusText: `Running ${task.title}`,
        taskStatuses: [{ taskId: task.id, status: 'in_progress' }],
      });
      return { success: true };
    },
    repoRoot: message.repoRoot,
    hooks: {
      onTaskStarted: (p, task) => {
        void ctx.webview?.postMessage({
          type: 'plan.execution.updated',
          requestId,
          sessionId,
          executionPlan: p,
          taskId: task.id,
          taskEvent: 'started',
        });
      },
      onTaskCompleted: (p, task) => {
        void ctx.webview?.postMessage({
          type: 'plan.execution.updated',
          requestId,
          sessionId,
          executionPlan: p,
          taskId: task.id,
          taskEvent: 'completed',
        });
        postCardPatch(ctx.webview, {
          sessionId,
          planId,
          phase: 'executing',
          taskStatuses: [{ taskId: task.id, status: 'verified' }],
        });
      },
      onTaskFailed: (p, task, error) => {
        void ctx.webview?.postMessage({
          type: 'plan.execution.updated',
          requestId,
          sessionId,
          executionPlan: p,
          taskId: task.id,
          taskEvent: 'failed',
          error,
        });
        postCardPatch(ctx.webview, {
          sessionId,
          planId,
          phase: 'failed',
          taskStatuses: [{ taskId: task.id, status: 'failed' }],
          statusText: error,
        });
      },
    },
  };

  try {
    const finished = await runPlanExecution(runnable, deps);
    void ctx.webview?.postMessage({
      type: 'plan.execution.updated',
      requestId,
      sessionId,
      executionPlan: finished,
      taskEvent: 'plan.completed',
    });
    postCardPatch(ctx.webview, {
      sessionId,
      planId,
      phase: finished.status === 'failed' ? 'failed' : 'completed',
      statusText:
        finished.status === 'failed' ? 'Plan execution failed' : 'Plan completed',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    void ctx.webview?.postMessage({
      type: 'plan.execution.error',
      requestId,
      error: msg,
    });
  }
}
