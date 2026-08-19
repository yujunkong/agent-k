/**
 * Bridge plan diagnostic events → ConversationWorkEvent for the WorkTimeline.
 * Keeps plan execution visible in the same Turn event pipeline as tool/subagent work.
 */
import type { ConversationWorkEvent, ConversationWorkStatus } from '../../chat/conversation/conversationWorkEvent';
import type { AnyPlanDiagnosticEvent } from './executionDiagnostics';

function statusFromDiagnostic(event: AnyPlanDiagnosticEvent): ConversationWorkStatus {
  switch (event.status) {
    case 'ok': return 'complete';
    case 'error': return 'error';
    case 'blocked': return 'error';
    case 'cancelled': return 'error';
    case 'running': return 'running';
    case 'pending': return 'pending';
    default: return 'running';
  }
}

function labelForEvent(event: AnyPlanDiagnosticEvent): string {
  switch (event.type) {
    case 'plan.execution.started': return `Plan started (${(event.metadata as any)?.taskCount ?? '?'} tasks)`;
    case 'plan.execution.completed': return 'Plan completed';
    case 'plan.execution.failed': return `Plan failed: ${(event.metadata as any)?.reason?.slice(0, 60) ?? ''}`;
    case 'plan.task.ready': return `Task ready: ${event.taskId}`;
    case 'plan.task.started': return `Task ${event.taskIndex != null ? `${event.taskIndex + 1}/${event.taskCount}` : ''}: ${(event.metadata as any)?.title ?? event.taskId}`;
    case 'plan.task.preflight': return `Preflight: ${event.taskId}${(event.metadata as any)?.blocked ? ' BLOCKED' : ''}`;
    case 'plan.task.dispatched': return `Dispatched: ${event.taskId} (${(event.metadata as any)?.execution})`;
    case 'plan.task.progress': return `Progress: ${(event.metadata as any)?.message ?? event.taskId}`;
    case 'plan.task.completed': return `Completed: ${event.taskId}`;
    case 'plan.task.failed': {
      const f = (event.metadata as any)?.failure;
      return `Failed: ${event.taskId} [${f?.category ?? 'unknown'}]`;
    }
    case 'plan.task.blocked': return `Blocked: ${event.taskId} by ${((event.metadata as any)?.blockedBy ?? []).join(',')}`;
    case 'plan.task.cancelled': return `Cancelled: ${event.taskId}`;
  }
}

function detailForEvent(event: AnyPlanDiagnosticEvent): string | undefined {
  if (event.type === 'plan.task.failed') {
    const f = (event.metadata as any)?.failure;
    return f?.message?.slice(0, 300);
  }
  if (event.type === 'plan.task.preflight') {
    const m = event.metadata as any;
    if (m?.blocked) {
      const missing = (m.targets ?? []).filter((t: any) => t.verdict === 'missing');
      return missing.map((t: any) => `${t.path} (${t.intent})`).join(', ');
    }
  }
  if (event.type === 'plan.execution.failed') {
    return (event.metadata as any)?.reason;
  }
  return undefined;
}

/**
 * Convert a plan diagnostic event into a ConversationWorkEvent.
 * Returns null for events that should not appear in the timeline
 * (e.g. task.ready is useful for tracing but not for UI rows).
 */
export function diagnosticToWorkEvent(event: AnyPlanDiagnosticEvent): ConversationWorkEvent | null {
  // Skip events that are trace-only (not useful as UI rows)
  if (event.type === 'plan.task.ready') return null;

  const isTerminal = event.status === 'ok' || event.status === 'error' || event.status === 'blocked' || event.status === 'cancelled';

  return {
    id: `plan_${event.executionId}_${event.type}_${event.taskId ?? 'root'}`,
    type: 'plan',
    status: statusFromDiagnostic(event),
    label: labelForEvent(event),
    detail: detailForEvent(event),
    startedAt: isTerminal ? undefined : event.timestamp,
    completedAt: isTerminal ? event.timestamp : undefined,
    executionId: event.executionId,
    taskId: event.taskId
  };
}
