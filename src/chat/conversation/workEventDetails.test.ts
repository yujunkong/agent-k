import { describe, expect, it } from 'vitest';
import type { ConversationWorkEvent } from './conversationWorkEvent';
import {
  linkPreviewToWorkEvents,
  resolveFileEditForEvent,
  resolveTerminalRunForEvent
} from './workEventDetails';

function event(
  partial: Partial<ConversationWorkEvent> & Pick<ConversationWorkEvent, 'id' | 'type'>
): ConversationWorkEvent {
  return {
    status: 'complete',
    label: partial.type[0].toUpperCase() + partial.type.slice(1),
    ...partial
  };
}

describe('linkPreviewToWorkEvents', () => {
  it('links a file edit onto the matching Edit row by toolId', () => {
    const events = [
      event({ id: 'tl_edit', type: 'edit', detail: 'ConversationTurn.tsx' })
    ];
    const next = linkPreviewToWorkEvents(events, {
      kind: 'fileEdit',
      fileEdit: {
        id: 'fe_1',
        path: 'src/chat/ConversationTurn.tsx',
        toolId: 'tl_edit'
      }
    });
    expect(next[0].ref).toEqual({ kind: 'fileEdit', id: 'fe_1' });
    expect(
      resolveFileEditForEvent(next[0], [
        {
          id: 'fe_1',
          path: 'src/chat/ConversationTurn.tsx',
          additions: 1,
          deletions: 0,
          lines: [],
          toolId: 'tl_edit'
        }
      ])?.id
    ).toBe('fe_1');
  });

  it('creates an Edit row when a file preview arrives without a timeline event', () => {
    const next = linkPreviewToWorkEvents([], {
      kind: 'fileEdit',
      fileEdit: { id: 'fe_2', path: 'src/a.ts', toolId: 'tl_missing' }
    });
    expect(next).toMatchObject([
      {
        id: 'tl_missing',
        type: 'edit',
        status: 'complete',
        label: 'Edit',
        detail: 'a.ts',
        ref: { kind: 'fileEdit', id: 'fe_2' }
      }
    ]);
  });

  it('links a terminal run onto the matching Terminal row', () => {
    const events = [event({ id: 'tl_term', type: 'terminal', detail: 'npm test' })];
    const next = linkPreviewToWorkEvents(events, {
      kind: 'terminal',
      terminalRun: {
        id: 'term_1',
        command: 'npm test',
        status: 'running',
        toolId: 'tl_term'
      }
    });
    expect(next[0].ref).toEqual({ kind: 'terminal', id: 'term_1' });
    expect(
      resolveTerminalRunForEvent(next[0], [
        {
          id: 'term_1',
          command: 'npm test',
          status: 'running',
          stdout: '',
          stderr: '',
          toolId: 'tl_term'
        }
      ])?.id
    ).toBe('term_1');
  });
});
