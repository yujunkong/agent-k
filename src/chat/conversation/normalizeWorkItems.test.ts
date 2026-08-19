import { describe, expect, it } from 'vitest';
import { normalizeWorkItems } from './normalizeWorkItems';
import type { ConversationWorkEvent } from './conversationWorkEvent';

describe('normalizeWorkItems', () => {
  it('passes canonical events through without remapping type', () => {
    const events: ConversationWorkEvent[] = [
      {
        id: '1',
        type: 'thinking',
        status: 'complete',
        label: 'Thinking'
      },
      {
        id: '2',
        type: 'search',
        status: 'complete',
        label: 'Search',
        detail: '12 results'
      },
      {
        id: '3',
        type: 'read',
        status: 'running',
        label: 'Read',
        detail: 'ChatApp.tsx'
      }
    ];

    expect(normalizeWorkItems(events)).toEqual(events);
  });

  it('does not infer type from free-form labels', () => {
    const events = [
      {
        id: 'x',
        type: 'generic',
        status: 'complete',
        label: 'searching the codebase for edits'
      }
    ] as ConversationWorkEvent[];

    expect(normalizeWorkItems(events)[0].type).toBe('generic');
  });

  it('drops incomplete rows', () => {
    expect(
      normalizeWorkItems([
        { id: '', type: 'read', status: 'complete', label: 'Read' },
        { id: 'ok', type: 'read', status: 'complete', label: 'Read' }
      ])
    ).toEqual([{ id: 'ok', type: 'read', status: 'complete', label: 'Read' }]);
  });
});
