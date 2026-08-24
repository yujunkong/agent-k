/**
 * SHARED-PLAN-002 — Plan generate / execute / card.patch protocol shapes.
 */

import type { RequestId } from '../common/ids';
import type { PlanDocument, PlanSessionPhase, TaskStatus } from './types';

/** Webview → Host: request structured plan generation. */
export type PlanGenerateMessage = {
  type: 'plan.generate';
  requestId: RequestId;
  sessionId?: string;
  /** User goal / research summary for the planner LLM. */
  goal?: string;
  researchContext?: string;
  rejectionFeedback?: string;
  /** Optional clarifying Q&A already collected in the card gate. */
  clarifications?: Array<{ question: string; answer: string }>;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  providerType?: string;
};

/** Webview → Host: cancel in-flight generate. */
export type PlanCancelMessage = {
  type: 'plan.cancel';
  requestId?: RequestId;
};

/** Webview → Host: Build from PlanCard (optional partial taskIds). */
export type PlanExecuteMessage = {
  type: 'plan.execute';
  requestId: RequestId;
  sessionId?: string;
  planId?: string;
  parentTurnId?: string;
  /** When set, only these tasks are scheduled (partial Build). */
  taskIds?: string[];
  /** Latest card-edited document (structured). */
  document?: PlanDocument;
  /** Pre-built execution DAG from webview adapter (legacy path). */
  executionPlan?: unknown;
  repoRoot?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  providerType?: string;
  thinkingEffort?: string;
};

/** Host → Webview: generate finished or failed. */
export type PlanGenerateResultMessage = {
  type: 'plan.generate.result';
  requestId: RequestId;
  sessionId?: string;
  error?: string;
  aborted?: boolean;
  /** Structured plan for PlanCard mount. */
  document?: PlanDocument;
  phase?: PlanSessionPhase;
  /** Full PlanGenerationResult for adapter commitPlanResult. */
  result?: {
    ok: boolean;
    plan?: PlanDocument;
    attempts: number;
    failures: unknown[];
  };
};

/** Host → Webview: hard execution failure (engine could not start). */
export type PlanExecutionErrorMessage = {
  type: 'plan.execution.error';
  requestId: RequestId;
  error: string;
};

/** Host → Webview: incremental card patch during review/exec. */
export type PlanCardPatchMessage = {
  type: 'plan.card.patch';
  sessionId?: string;
  planId: string;
  phase?: PlanSessionPhase;
  /** Full document replace when present. */
  document?: PlanDocument;
  /** Per-task status updates (merge onto card). */
  taskStatuses?: Array<{ taskId: string; status: TaskStatus }>;
  /** Human-readable status line for the card chrome. */
  statusText?: string;
};
