import type { ConversationWorkEvent } from './conversationWorkEvent';
import { isCanonicalWorkType } from './conversationWorkEvent';

export type { ConversationWorkEvent } from './conversationWorkEvent';

/**
 * Validity filter only — canonical events pass through unchanged.
 * Does not infer type/status from free-form labels.
 */
export function normalizeWorkItems(
  events: ConversationWorkEvent[] = []
): ConversationWorkEvent[] {
  return events.filter(
    (event) => event && event.id && isCanonicalWorkType(event.type) && event.status
  );
}
