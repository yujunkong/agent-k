import { describe, expect, it } from 'vitest';
import {
  beginWorkEvent,
  classifyWorkType,
  completeWorkEvent,
  settleWorkEvents,
  upsertWorkEvents,
  workEventFromHostPayload,
  workEventsFromLegacySteps,
  type ConversationWorkEvent
} from './conversationWorkEvent';

describe('classifyWorkType', () => {
  it('maps host tools to explicit types instead of guessing from labels', () => {
    expect(classifyWorkType('grep')).toBe('search');
    expect(classifyWorkType('read_file')).toBe('read');
    expect(classifyWorkType('edit_file')).toBe('edit');
    expect(classifyWorkType('run_terminal_cmd')).toBe('terminal');
    expect(classifyWorkType('read_lints')).toBe('verify');
  });

  it('ignores thought / plan / ask chrome', () => {
    expect(classifyWorkType(undefined, 'thinking')).toBeNull();
    expect(classifyWorkType(undefined, 'planning')).toBeNull();
    expect(classifyWorkType('ask_question', 'asking')).toBeNull();
    expect(classifyWorkType('todo_write', 'session')).toBeNull();
  });

  it('falls back to timeline kind when the tool name is unknown', () => {
    expect(classifyWorkType('mystery_tool', 'searching')).toBe('search');
    expect(classifyWorkType('mystery_tool', 'editing')).toBe('edit');
  });
});

describe('work event lifecycle', () => {
  it('starts running and completes on the same id', () => {
    const start = beginWorkEvent({
      id: 'tl_1',
      toolName: 'grep',
      detail: 'WorkTimeline',
      now: 1000
    });
    expect(start).toMatchObject({
      id: 'tl_1',
      type: 'search',
      status: 'running',
      label: 'Search',
      detail: 'WorkTimeline',
      startedAt: 1000
    });

    const events = upsertWorkEvents([], start!);
    const ended = completeWorkEvent(events[0], { detail: '12 results', now: 2000 });
    const next = upsertWorkEvents(events, ended);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'tl_1',
      type: 'search',
      status: 'complete',
      detail: '12 results',
      startedAt: 1000,
      completedAt: 2000
    });
  });

  it('appends distinct tools onto one agent turn', () => {
    let events: ConversationWorkEvent[] = [];
    for (const [id, toolName] of [
      ['a', 'grep'],
      ['b', 'read_file'],
      ['c', 'edit_file']
    ] as const) {
      const started = beginWorkEvent({ id, toolName, now: 1 });
      events = upsertWorkEvents(events, started!);
    }

    expect(events.map((e) => e.type)).toEqual(['search', 'read', 'edit']);
    expect(events.every((e) => e.status === 'running')).toBe(true);

    events = upsertWorkEvents(
      events,
      completeWorkEvent(events[0], { now: 2 })
    );
    expect(events[0].status).toBe('complete');
    expect(events[1].status).toBe('running');
    expect(events[2].status).toBe('running');
  });

  it('records error status from tool.end', () => {
    const event = workEventFromHostPayload(
      { id: 'tl_err', toolName: 'edit_file', kind: 'editing', error: 'EPERM' },
      'complete'
    );
    expect(event).toMatchObject({
      id: 'tl_err',
      type: 'edit',
      status: 'error',
      label: 'Edit',
      detail: 'EPERM'
    });
  });

  it('settles leftover running rows when the stream ends', () => {
    const events = settleWorkEvents(
      [
        {
          id: '1',
          type: 'read',
          status: 'running',
          label: 'Read',
          startedAt: 1
        },
        {
          id: '2',
          type: 'search',
          status: 'complete',
          label: 'Search',
          completedAt: 2
        }
      ],
      'complete',
      9
    );
    expect(events[0]).toMatchObject({ status: 'complete', completedAt: 9 });
    expect(events[1].completedAt).toBe(2);
  });
});

describe('legacy step lift', () => {
  it('keeps only work kinds and drops Thought', () => {
    const events = workEventsFromLegacySteps([
      { id: 't', kind: 'thinking', label: 'Thought', itemStatus: 'done' },
      { id: 's', kind: 'searching', toolName: 'grep', detail: 'foo', itemStatus: 'done' },
      { id: 'p', kind: 'planning', label: 'Planning', itemStatus: 'done' }
    ]);
    expect(events).toEqual([
      {
        id: 's',
        type: 'search',
        status: 'complete',
        label: 'Search',
        detail: 'foo'
      }
    ]);
  });
});
