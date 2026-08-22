/**
 * Map ConversationWorkEvent → MessageSteps row shape.
 * WorkTimeline keeps workItems as source of truth; MessageSteps owns sequential chrome.
 */
import type { ConversationWorkEvent } from './conversationWorkEvent';
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
    case 'generic':
      return 'working';
    default:
      return 'working';
  }
}

function inferTurnFromId(id: string): number | undefined {
  const m = id.match(/(?:thinking|planning|tool|step|tl_)[^\d]*(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

/**
 * Root-level work events only (subagent children stay on WorkTimeline SubagentRunRow).
 */
export function workEventsToMessageSteps(
  events: ConversationWorkEvent[] = []
): MessageStep[] {
  const out: MessageStep[] = [];
  for (const event of events) {
    if (event.subagentId || event.type === 'subagent') continue;
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
