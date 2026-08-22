import { describe, expect, it } from 'vitest';
import type { ConversationWorkEvent } from './conversationWorkEvent';
import { groupWorkTimelineItems } from './groupWorkTimelineItems';

const thinking: ConversationWorkEvent = {
  id: 'tl_thinking_1',
  type: 'thinking',
  status: 'complete',
  label: 'Thinking'
};

const header: ConversationWorkEvent = {
  id: 'tl_subagent_a',
  type: 'subagent',
  status: 'running',
  label: 'Research authentication · running',
  subagentId: 'a'
};

const childRead: ConversationWorkEvent = {
  id: 'tl_sub_a_read',
  type: 'read',
  status: 'complete',
  label: 'Read',
  detail: 'auth.ts',
  subagentId: 'a'
};

const childSearch: ConversationWorkEvent = {
  id: 'tl_sub_a_search',
  type: 'search',
  status: 'complete',
  label: 'Search',
  detail: 'session',
  subagentId: 'a'
};

const parentEdit: ConversationWorkEvent = {
  id: 'tl_edit_1',
  type: 'edit',
  status: 'complete',
  label: 'Edit',
  detail: '+12 -5'
};

describe('groupWorkTimelineItems', () => {
  it('leaves normal events flat', () => {
    const nodes = groupWorkTimelineItems([thinking, parentEdit]);
    expect(nodes.map((n) => n.kind)).toEqual(['item', 'item']);
  });

  it('nests child rows under the subagent header without duplicating it', () => {
    const nodes = groupWorkTimelineItems([
      thinking,
      header,
      {
        ...header,
        id: 'tl_sub_a_thought',
        type: 'thinking',
        label: 'Thinking',
        subagentId: 'a'
      },
      childRead,
      childSearch,
      parentEdit,
      { ...header, status: 'complete', label: 'Research authentication · completed' }
    ]);

    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toMatchObject({ kind: 'item', item: { id: 'tl_thinking_1' } });
    expect(nodes[1].kind).toBe('group');
    if (nodes[1].kind !== 'group') return;
    expect(nodes[1].header.label).toBe('Research authentication · completed');
    expect(nodes[1].children.map((c) => c.id)).toEqual([
      'tl_sub_a_thought',
      'tl_sub_a_read',
      'tl_sub_a_search'
    ]);
    expect(nodes[2]).toMatchObject({ kind: 'item', item: { id: 'tl_edit_1' } });
  });

  it('creates a group when child events arrive before the header', () => {
    const nodes = groupWorkTimelineItems([childRead, header]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe('group');
    if (nodes[0].kind !== 'group') return;
    expect(nodes[0].header.label).toBe('Research authentication · running');
    expect(nodes[0].children).toEqual([childRead]);
  });
});
