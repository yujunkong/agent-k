/**
 * Presentation grouping for WorkTimeline.
 * Event store stays flat; this only nests rows that already carry subagentId.
 */
import {
  isSubagentHeaderEvent,
  type ConversationWorkEvent
} from './conversationWorkEvent';

export type WorkTimelineNode =
  | { kind: 'item'; item: ConversationWorkEvent }
  | {
      kind: 'group';
      id: string;
      header: ConversationWorkEvent;
      children: ConversationWorkEvent[];
    };

function implicitHeader(subagentId: string): ConversationWorkEvent {
  return {
    id: `tl_subagent_${subagentId}`,
    type: 'subagent',
    status: 'running',
    label: 'Subagent · running',
    subagentId
  };
}

/** Keep first-seen order: Thought, then a subagent group, then sibling rows. */
export function groupWorkTimelineItems(
  items: ConversationWorkEvent[] = []
): WorkTimelineNode[] {
  const nodes: WorkTimelineNode[] = [];
  const groups = new Map<string, Extract<WorkTimelineNode, { kind: 'group' }>>();

  const ensureGroup = (
    subagentId: string,
    header?: ConversationWorkEvent
  ): Extract<WorkTimelineNode, { kind: 'group' }> => {
    const existing = groups.get(subagentId);
    if (existing) {
      if (header && isSubagentHeaderEvent(header)) existing.header = header;
      return existing;
    }
    const group: Extract<WorkTimelineNode, { kind: 'group' }> = {
      kind: 'group',
      id: subagentId,
      header:
        header && isSubagentHeaderEvent(header)
          ? header
          : implicitHeader(subagentId),
      children: []
    };
    groups.set(subagentId, group);
    nodes.push(group);
    return group;
  };

  for (const item of items) {
    const subagentId = item.subagentId;
    if (!subagentId) {
      nodes.push({ kind: 'item', item });
      continue;
    }
    if (isSubagentHeaderEvent(item)) {
      ensureGroup(subagentId, item);
      continue;
    }
    ensureGroup(subagentId).children.push(item);
  }

  return nodes;
}
