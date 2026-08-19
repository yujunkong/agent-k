import { describe, expect, it } from 'vitest';
import { normalizeWorkItems } from './normalizeWorkItems';
import type { ConversationWorkEvent } from './conversationWorkEvent';

describe('normalizeWorkItems', () => {
  it('maps the explicit event model onto WorkTimeline items', () => {
    const events: ConversationWorkEvent[] = [
      {
        id: '1',
        type: 'search',
        status: 'complete',
        label: 'Search',
        detail: '12 results'
      },
      {
        id: '2',
        type: 'read',
        status: 'running',
        label: 'Read',
        detail: 'ChatApp.tsx'
      },
      {
        id: '3',
        type: 'verify',
        status: 'pending',
        label: 'Verify'
      }
    ];

    expect(normalizeWorkItems(events)).toEqual([
      { id: '1', label: 'Search', detail: '12 results', kind: 'search', status: 'complete' },
      { id: '2', label: 'Read', detail: 'ChatApp.tsx', kind: 'read', status: 'running' },
      { id: '3', label: 'Verify', detail: undefined, kind: 'verify', status: 'pending' }
    ]);
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

    expect(normalizeWorkItems(events)[0].kind).toBe('generic');
  });
});
