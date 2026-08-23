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

  it('keeps subagent headers in order and skips child-tagged tools', () => {
    const events: ConversationWorkEvent[] = [
      {
        id: 'tl_subagent_x',
        type: 'subagent',
        status: 'running',
        label: 'Agent',
        description: 'Phase 1 audit',
        subagentId: 'x',
        role: 'review'
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
    expect(steps.map((s) => s.id)).toEqual(['tl_subagent_x', 'tl_tool_root']);
    expect(steps[0]).toMatchObject({
      kind: 'subagent',
      toolName: 'task_run',
      subagentId: 'x',
      description: 'Phase 1 audit',
      role: 'review',
      itemStatus: 'running'
    });
    expect(steps[1].kind).toBe('searching');
  });

  it('does not infer turn from digits inside tl_subagent task ids', () => {
    const events: ConversationWorkEvent[] = [
      {
        id: 'tl_tool_read',
        type: 'read',
        status: 'complete',
        label: 'Reading',
        toolName: 'read_file'
      },
      {
        // Comment: mt5s… would match turn 5 with the old tl_…(\\d+) regex
        id: 'tl_subagent_subagent-mt5sznft-q1zbft',
        type: 'subagent',
        status: 'running',
        label: 'Agent',
        description: 'Quality pass',
        subagentId: 'subagent-mt5sznft-q1zbft',
        parentTurnId: '1'
      }
    ];
    const steps = workEventsToMessageSteps(events);
    expect(steps[1].turn).toBe(1);
    expect(steps[1].turn).not.toBe(5);
  });
});
