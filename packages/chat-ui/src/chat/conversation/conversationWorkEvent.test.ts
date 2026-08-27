import { describe, expect, it } from 'vitest';
import {
  beginWorkEvent,
  classifyWorkType,
  clipSubagentSummary,
  completeWorkEvent,
  settleWorkEvents,
  settleSubagentWorkEvents,
  applyWorkEvent,
  flattenSubagentWorkItems,
  sealStaleThoughtsBeforeTools,
  upsertWorkEvents,
  patchSubagentResultInEvents,
  workEventFromHostPayload,
  workEventFromSubagentHostEvent,
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

  it('maps thinking onto the unified timeline and ignores plan/ask chrome', () => {
    expect(classifyWorkType(undefined, 'thinking')).toBe('thinking');
    expect(classifyWorkType(undefined, 'planning')).toBeNull();
    expect(classifyWorkType('ask_question', 'asking')).toBe('ask');
    expect(classifyWorkType(undefined, 'asking')).toBe('ask');
    expect(classifyWorkType('todo_write', 'session')).toBeNull();
  });

  it('maps task_run onto a subagent header without treating skill_run as one', () => {
    expect(classifyWorkType('task_run', 'task')).toBe('subagent');
    expect(classifyWorkType('task', 'task')).toBe('subagent');
    expect(classifyWorkType('skill_run', 'task')).toBe('generic');
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

  it('appends thinking then tools in first-seen order', () => {
    let events: ConversationWorkEvent[] = [];
    events = upsertWorkEvents(
      events,
      beginWorkEvent({ id: 't', timelineKind: 'thinking', now: 1 })!
    );
    events = upsertWorkEvents(
      events,
      beginWorkEvent({ id: 's', toolName: 'grep', now: 2 })!
    );
    events = upsertWorkEvents(
      events,
      beginWorkEvent({ id: 'r', toolName: 'read_file', now: 3 })!
    );

    expect(events.map((e) => e.type)).toEqual(['thinking', 'search', 'read']);
    expect(events[0].label).toBe('Thinking');

    events = upsertWorkEvents(events, completeWorkEvent(events[0], { now: 4 }));
    expect(events.map((e) => e.type)).toEqual(['thinking', 'search', 'read']);
    expect(events[0].status).toBe('complete');
    expect(events[1].status).toBe('running');
  });

  it('keeps reasoning text on Thinking rows from host timeline', () => {
    const event = workEventFromHostPayload(
      {
        id: 'tl_thinking_1',
        kind: 'thinking',
        detail: 'Authentication uses JWT middleware',
        status: 'running'
      },
      'running'
    );
    expect(event).toMatchObject({
      id: 'tl_thinking_1',
      type: 'thinking',
      status: 'running',
      label: 'Thinking',
      detail: 'Authentication uses JWT middleware'
    });
  });

  it('keeps child thinking detail and stamps subagentId for grouping', () => {
    const event = workEventFromHostPayload(
      {
        id: 'tl_sub_a_thought',
        kind: 'thinking',
        detail: 'Inspecting auth dependencies',
        subagentId: 'a',
        parentTurnId: '1',
        status: 'running'
      },
      'running'
    );
    expect(event).toMatchObject({
      type: 'thinking',
      detail: 'Inspecting auth dependencies',
      subagentId: 'a',
      parentTurnId: '1'
    });
  });

  it('builds a subagent header from lifecycle events using summary only', () => {
    const running = workEventFromSubagentHostEvent({
      type: 'subagent.started',
      taskId: 'a',
      parentTurnId: '3',
      role: 'research',
      status: 'running',
      prompt: 'authentication'
    });
    expect(running).toMatchObject({
      id: 'tl_subagent_a',
      type: 'subagent',
      status: 'running',
      label: 'Explorer authentication · running',
      detail: undefined,
      subagentId: 'a',
      parentTurnId: '3',
      role: 'research'
    });

    const transcript = 'line\n'.repeat(80) + 'Authentication flow is handled in session.ts.';
    const completed = workEventFromSubagentHostEvent({
      type: 'subagent.completed',
      taskId: 'a',
      role: 'research',
      status: 'completed',
      prompt: 'authentication',
      summary: 'Authentication flow is handled in session.ts.',
      filesChanged: 2,
      toolCount: 14,
      duration: 8400
    });
    expect(completed?.label).toBe('Explorer authentication · completed');
    expect(completed?.detail).toBeUndefined();
    expect(completed?.result).toEqual({
      subagentId: 'a',
      summary: 'Authentication flow is handled in session.ts.',
      filesChanged: 2,
      toolCount: 14,
      durationMs: 8400
    });
    expect(completed?.result?.summary).not.toContain('line\n');
    expect(clipSubagentSummary(transcript)?.includes('line\n')).toBeFalsy();
  });

  it('prefers task_run description for subagent progress title', () => {
    const running = workEventFromSubagentHostEvent({
      type: 'subagent.started',
      taskId: 'b',
      role: 'research',
      status: 'running',
      prompt: 'long handoff prompt that should not be the title',
      description: 'Exploring auth flow'
    });
    expect(running?.description).toBe('Exploring auth flow');
    expect(running?.label).toBe('Exploring auth flow · running');
  });

  it('patches subagent header worktree state by subagent id', () => {
    const events: ConversationWorkEvent[] = [
      {
        id: 'tl_subagent_a',
        type: 'subagent',
        status: 'complete',
        label: 'Research auth · completed',
        result: { subagentId: 'a', summary: 'done', filesChanged: 1 }
      }
    ];
    const next = patchSubagentResultInEvents(events, 'a', (prev) => ({
      ...prev,
      worktreeOutcome: 'applied',
      worktreeAction: 'idle'
    }));
    expect(next[0].result?.worktreeOutcome).toBe('applied');
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

  it('preserves a child preview ref across status updates', () => {
    const started = beginWorkEvent({
      id: 'tl_term',
      toolName: 'run_terminal_cmd',
      detail: 'npm test',
      now: 1
    })!;
    const withRef: ConversationWorkEvent = {
      ...started,
      ref: { kind: 'terminal', id: 'term_1' }
    };
    const next = upsertWorkEvents(
      upsertWorkEvents([], withRef),
      completeWorkEvent(started, { now: 2 })
    );
    expect(next[0].ref).toEqual({ kind: 'terminal', id: 'term_1' });
    expect(next[0].status).toBe('complete');
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

  it('does not resurrect a completed subagent header with a late running ping', () => {
    const done: ConversationWorkEvent = {
      id: 'tl_subagent_a',
      type: 'subagent',
      status: 'complete',
      label: 'Research auth · completed',
      subagentId: 'a',
      completedAt: 2
    };
    const next = upsertWorkEvents(done ? [done] : [], {
      ...done,
      status: 'running',
      label: 'Research auth · running',
      completedAt: undefined
    });
    expect(next[0]).toMatchObject({ status: 'complete', completedAt: 2 });
  });

  it('settles leftover Thought when the subagent header completes', () => {
    const thought: ConversationWorkEvent = {
      id: 'tl_sub_a_thought',
      type: 'thinking',
      status: 'running',
      label: 'Thought',
      subagentId: 'a',
      startedAt: 1
    };
    const header = workEventFromSubagentHostEvent({
      type: 'subagent.completed',
      taskId: 'a',
      role: 'research',
      status: 'completed',
      prompt: 'authentication'
    })!;
    const next = applyWorkEvent([thought], header);
    expect(next.find((e) => e.id === 'tl_sub_a_thought')).toMatchObject({
      status: 'complete'
    });
    expect(next.find((e) => e.id === 'tl_subagent_a')).toMatchObject({
      status: 'complete'
    });
    expect(
      settleSubagentWorkEvents([thought], 'a', 'complete', 9)[0]
    ).toMatchObject({ status: 'complete', completedAt: 9 });
  });

  it('flattens subagent children into a main-turn sequence', () => {
    const { header, steps } = flattenSubagentWorkItems(
      [
        {
          id: 'tl_subagent_a',
          type: 'subagent',
          status: 'complete',
          label: 'Agent',
          subagentId: 'a'
        },
        {
          id: 'tl_sub_a_thought',
          type: 'thinking',
          status: 'complete',
          label: 'Thought',
          subagentId: 'a'
        },
        {
          id: 'tl_sub_a_read',
          type: 'read',
          status: 'complete',
          label: 'Read',
          subagentId: 'a'
        }
      ],
      'a'
    );
    expect(header?.id).toBe('tl_subagent_a');
    expect(steps.map((s) => s.id)).toEqual(['tl_sub_a_thought', 'tl_sub_a_read']);
    expect(steps.every((s) => s.subagentId == null)).toBe(true);
  });

  it('seals a running Thought that already has tools below it', () => {
    const sealed = sealStaleThoughtsBeforeTools(
      [
        {
          id: 'tl_sub_a_thought_0',
          type: 'thinking',
          status: 'running',
          label: 'Thought',
          detail: 'planning…',
          startedAt: 1
        },
        {
          id: 'tl_sub_a_read',
          type: 'read',
          status: 'complete',
          label: 'Read',
          detail: 'a.ts'
        },
        {
          id: 'tl_sub_a_thought_1',
          type: 'thinking',
          status: 'running',
          label: 'Thought',
          detail: 'next…',
          startedAt: 5
        }
      ],
      9
    );
    expect(sealed[0]).toMatchObject({
      id: 'tl_sub_a_thought_0',
      status: 'complete',
      completedAt: 9
    });
    // Latest thought (no tools after it) stays live for mid-timeline Thinking.
    expect(sealed[2]).toMatchObject({
      id: 'tl_sub_a_thought_1',
      status: 'running'
    });
  });
});

describe('legacy step lift', () => {
  it('lifts Thinking + tools and drops Planning', () => {
    const events = workEventsFromLegacySteps([
      { id: 't', kind: 'thinking', label: 'Thought', detail: 'long thought dump', itemStatus: 'done' },
      { id: 's', kind: 'searching', toolName: 'grep', detail: 'foo', itemStatus: 'done' },
      { id: 'p', kind: 'planning', label: 'Planning', itemStatus: 'done' }
    ]);
    expect(events).toEqual([
      {
        id: 't',
        type: 'thinking',
        status: 'complete',
        label: 'Thinking',
        toolName: undefined,
        detail: 'long thought dump'
      },
      {
        id: 's',
        type: 'search',
        status: 'complete',
        label: 'Search',
        toolName: 'grep',
        detail: 'foo'
      }
    ]);
  });
});
