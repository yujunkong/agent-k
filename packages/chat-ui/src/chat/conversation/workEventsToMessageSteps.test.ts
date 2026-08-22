import { describe, expect, it } from 'vitest';
import { workEventsToMessageSteps } from './workEventsToMessageSteps';
import type { ConversationWorkEvent } from './conversationWorkEvent';

describe('workEventsToMessageSteps', () => {
  it('maps root work events to MessageStep kinds/status', () => {
    const events: ConversationWorkEvent[] = [
      {
        id: 'tl_thinking_1',
        type: 'thinking',
        status: 'complete',
        label: 'Thought',
        detail: 'plan',
        startedAt: 1000,
        completedAt: 2500
      },
      {
        id: 'tl_tool_1',
        type: 'read',
        status: 'running',
        label: 'Reading',
        toolName: 'read_file',
        detail: 'foo.ts'
      },
      {
        id: 'tl_tool_2',
        type: 'terminal',
        status: 'error',
        label: 'Terminal',
        toolName: 'run_terminal_cmd'
      }
    ];
    const steps = workEventsToMessageSteps(events);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({
      kind: 'thinking',
      itemStatus: 'done',
      thoughtRole: 'opening',
      turn: 1,
      durationMs: 1500
    });
    expect(steps[1]).toMatchObject({
      kind: 'reading',
      itemStatus: 'running',
      toolName: 'read_file'
    });
    expect(steps[2]).toMatchObject({
      kind: 'running',
      itemStatus: 'error',
      toolName: 'run_terminal_cmd'
    });
  });

  it('skips subagent events (parent SubagentRunRow owns them)', () => {
    const events: ConversationWorkEvent[] = [
      {
        id: 'tl_subagent_x',
        type: 'subagent',
        status: 'running',
        label: 'Agent',
        subagentId: 'x'
      },
      {
        id: 'tl_tool_child',
        type: 'read',
        status: 'running',
        label: 'Reading',
        subagentId: 'x'
      },
      {
        id: 'tl_tool_root',
        type: 'search',
        status: 'complete',
        label: 'Search',
        toolName: 'grep'
      }
    ];
    const steps = workEventsToMessageSteps(events);
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe('tl_tool_root');
    expect(steps[0].kind).toBe('searching');
  });
});
