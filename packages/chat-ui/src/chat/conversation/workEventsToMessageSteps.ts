/**
 * Map ConversationWorkEvent → MessageSteps row shape.
 * WorkTimeline keeps workItems as source of truth; MessageSteps owns sequential chrome.
 */
import {
  isSubagentHeaderEvent,
  type ConversationWorkEvent
} from './conversationWorkEvent';
import type { MessageStep } from '../components/MessageSteps';

function mapStatus(
  status: ConversationWorkEvent['status']
): MessageStep['itemStatus'] {
  if (status === 'error') return 'error';
  if (status === 'complete') return 'done';
  return 'running';
}

/** Host timeline kinds MessageSteps expects (reading/searching/editing/…). */
function mapKind(event: ConversationWorkEvent): string {
  switch (event.type) {
    case 'thinking':
      return 'thinking';
    case 'read':
      return 'reading';
    case 'search':
      return 'searching';
    case 'edit':
      return 'editing';
    case 'terminal':
      return 'running';
    case 'verify':
      return 'verifying';
    case 'plan':
      return 'thinking';
    case 'subagent':
      return 'subagent';
    case 'generic':
      return 'working';
    default:
      return 'working';
  }
}

function inferTurnFromId(id: string): number | undefined {
  // Comment: SUB-010 — never parse digits from tl_subagent_<taskId> (e.g. mt5s… → turn 5
  // sorts the RunRow after all turn-1 Explore/Ran → "stuck at the end").
  if (id.startsWith('tl_subagent_')) return undefined;
  const m = id.match(/(?:thinking|planning|tool|step)[^\d]*(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

function subagentHeaderToStep(event: ConversationWorkEvent): MessageStep {
  const subagentId =
    event.subagentId ||
    (event.id.startsWith('tl_subagent_')
      ? event.id.slice('tl_subagent_'.length)
      : undefined);
  // Comment: prefer host parentTurnId ("1") over garbage id digits
  const fromParent = Number(event.parentTurnId);
  const turn =
    Number.isFinite(fromParent) && fromParent > 0
      ? fromParent
      : inferTurnFromId(event.id);
  return {
    id: event.id,
    kind: 'subagent',
    // Comment: SUB-010 — prefer short description for SubagentRunRow title (never "X · completed" label)
    label:
      String(event.description || '').trim() ||
      event.label ||
      'Subagent',
    detail: event.detail,
    toolName: event.toolName || 'task_run',
    openPath: event.openPath,
    turn,
    itemStatus: mapStatus(event.status),
    durationMs:
      event.startedAt != null && event.completedAt != null
        ? Math.max(0, event.completedAt - event.startedAt)
        : undefined,
    subagentId,
    role: event.role,
    description: event.description
  };
}

/**
 * Parent timeline in chronological workItems order.
 * Subagent headers → MessageSteps rows (SubagentRunRow); child-tagged tools skipped.
 */
export function workEventsToMessageSteps(
  events: ConversationWorkEvent[] = []
): MessageStep[] {
  const out: MessageStep[] = [];
  for (const event of events) {
    if (event.type === 'subagent' || isSubagentHeaderEvent(event)) {
      out.push(subagentHeaderToStep(event));
      continue;
    }
    // Comment: child dual-write leftover — never show under parent MessageSteps
    if (event.subagentId) continue;
    const turn = inferTurnFromId(event.id);
    const durationMs =
      event.startedAt != null && event.completedAt != null
        ? Math.max(0, event.completedAt - event.startedAt)
        : undefined;
    out.push({
      id: event.id,
      kind: mapKind(event),
      label: event.label || event.type,
      detail: event.detail,
      toolName: event.toolName,
      openPath: event.openPath,
      turn,
      thoughtRole: event.type === 'thinking' ? 'opening' : undefined,
      itemStatus: mapStatus(event.status),
      durationMs
    });
  }
  return out;
}
