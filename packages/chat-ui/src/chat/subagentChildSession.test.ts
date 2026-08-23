import { describe, expect, it, beforeEach } from 'vitest';
import {
  ensureSubagentChildSession,
  rollingLineFromChildMessages
} from './subagentChildSession';
import { sessionStore } from './hooks/useChatSessions';
import type { ChatMessage } from './types';

describe('rollingLineFromChildMessages', () => {
  it('returns keypoint only — not command detail', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u',
        role: 'user',
        content: 'go',
        status: 'complete',
        timestamp: 1
      },
      {
        id: 'a',
        role: 'assistant',
        content: '',
        status: 'streaming',
        timestamp: 2,
        workItems: [
          {
            id: 't1',
            type: 'thinking',
            status: 'complete',
            label: 'Thought',
            detail: 'long reasoning that must not surface'
          },
          {
            id: 't2',
            type: 'terminal',
            status: 'running',
            label: 'Ran',
            toolName: 'run_terminal_cmd',
            detail:
              'git log -p --all -S "delete_selection_internal" -- core/src/lib.rs'
          }
        ]
      }
    ];
    expect(rollingLineFromChildMessages(messages)).toBe('Ran');
  });

  it('prefers running Read over settled Thought', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        content: '',
        status: 'streaming',
        timestamp: 1,
        workItems: [
          {
            id: 't1',
            type: 'thinking',
            status: 'complete',
            label: 'Thought',
            detail: 'old'
          },
          {
            id: 't2',
            type: 'read',
            status: 'running',
            label: 'Reading',
            toolName: 'read_file',
            detail: 'fs/src/lib.rs'
          }
        ]
      }
    ];
    expect(rollingLineFromChildMessages(messages)).toBe('Read');
  });

  it('returns undefined when child has no work yet', () => {
    expect(
      rollingLineFromChildMessages([
        {
          id: 'a',
          role: 'assistant',
          content: '',
          status: 'streaming',
          timestamp: 1,
          workItems: []
        }
      ])
    ).toBeUndefined();
  });

  it('returns Completed when child assistant settled (not last Edited)', () => {
    expect(
      rollingLineFromChildMessages([
        {
          id: 'a',
          role: 'assistant',
          content: 'done',
          status: 'complete',
          timestamp: 1,
          workItems: [
            {
              id: 'e1',
              type: 'edit',
              status: 'complete',
              label: 'Edited',
              toolName: 'edit_file'
            }
          ]
        }
      ])
    ).toBe('Completed');
  });
});

describe('ensureSubagentChildSession', () => {
  beforeEach(() => {
    for (const s of [...sessionStore.list()]) {
      sessionStore.delete(s.id);
    }
  });

  it('seeds user+assistant once and does not append after complete', () => {
    const childId = 'sess-sub-ensure-idem';
    ensureSubagentChildSession({
      childSessionId: childId,
      parentSessionId: 'sess-parent',
      title: 'Phase 1 verify',
      userPrompt: 'real prompt'
    });
    const seeded = sessionStore.get(childId)?.messages || [];
    expect(seeded).toHaveLength(2);
    expect(seeded[0].content).toBe('real prompt');

    sessionStore.saveMessages(
      childId,
      [
        seeded[0],
        { ...seeded[1], status: 'complete', content: 'done', workItems: [] }
      ],
      'agent',
      { setCurrent: false }
    );

    ensureSubagentChildSession({
      childSessionId: childId,
      parentSessionId: 'sess-parent',
      title: 'Subagent'
    });
    const after = sessionStore.get(childId)?.messages || [];
    expect(after).toHaveLength(2);
    expect(after[0].content).toBe('real prompt');
    expect(after.some((m) => m.content === 'Subagent')).toBe(false);
  });
});
