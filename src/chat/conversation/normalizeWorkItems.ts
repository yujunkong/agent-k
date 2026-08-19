import type { WorkItem } from '../components/WorkTimeline';
import {
  isCanonicalWorkType,
  type ConversationWorkEvent,
  WORK_TYPE_LABEL
} from './conversationWorkEvent';

export type { ConversationWorkEvent } from './conversationWorkEvent';

/** Presentation mapper — canonical events pass through; no substring guessing. */
export function normalizeWorkItems(events: ConversationWorkEvent[] = []): WorkItem[] {
  return events
    .filter((event) => event && event.id && isCanonicalWorkType(event.type))
    .map((event) => ({
      id: event.id,
      label: event.label || WORK_TYPE_LABEL[event.type],
      detail: event.detail,
      kind: event.type,
      status: event.status
    }));
}
