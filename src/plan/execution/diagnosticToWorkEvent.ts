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
    if (!f) return undefined;
    const parts: string[] = [];
    if (f.code) parts.push(`[${f.category}/${f.code}]`);
    parts.push((f.message ?? '').slice(0, 200));
    if (f.cause) {
      parts.push(`← ${f.cause.category}${f.cause.code ? '/' + f.cause.code : ''}`);
      if (f.cause.command) {
        const cmd = f.cause.command;
        parts.push(`cmd: ${cmd.command?.slice(0, 80)}`);
        if (cmd.exitCode != null) parts.push(`exit=${cmd.exitCode}`);
        if (cmd.cwd) parts.push(`cwd=${cmd.cwd}`);
        if (cmd.stderr) parts.push(`stderr: ${cmd.stderr.slice(0, 100)}`);
      }
    }
    return parts.join(' ');
  }
  if (event.type === 'plan.task.blocked') {
    const m = event.metadata as any;
    const details = m?.blockedByDetails;
    if (Array.isArray(details) && details.length > 0) {
      return details.map((d: any) => `${d.taskId}${d.failureCode ? ':' + d.failureCode : ''}`).join(', ');
    }
  }
  if (event.type === 'plan.task.preflight') {
    const m = event.metadata as any;
    if (m?.blocked) {
      const missing = (m.targets ?? []).filter((t: any) => t.verdict === 'missing');
      return missing.map((t: any) => `${t.path} (${t.intent})`).join(', ');
    }
  }
  if (event.type === 'plan.execution.failed') {
    const m = event.metadata as any;
    const parts: string[] = [];
    if (m?.reason) parts.push(m.reason);
    if (m?.rootCause) {
      const rc = m.rootCause;
      parts.push(`Root cause: ${rc.taskId} [${rc.category}${rc.code ? '/' + rc.code : ''}]`);
      if (rc.cause?.command) {
        parts.push(`cmd: ${rc.cause.command.command?.slice(0, 60)}`);
      }
    }
    return parts.join(' | ') || undefined;
  }
  return undefined;
}

/**
 * Convert a plan diagnostic event into a ConversationWorkEvent.
 * Returns null for events that should not appear in the timeline
 * (e.g. task.ready is useful for tracing but not for UI rows).
 */
export function diagnosticToWorkEvent(event: AnyPlanDiagnosticEvent): ConversationWorkEvent | null {
  // Progress/dispatch live in the Executing N/M bar. WorkTimeline shows tools + failures.
  const keep =
    event.type === 'plan.task.failed' ||
    event.type === 'plan.task.blocked' ||
    event.type === 'plan.task.cancelled' ||
    event.type === 'plan.execution.failed';
  if (!keep) return null;

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
