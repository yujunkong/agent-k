import { describe, expect, it } from 'vitest';
import type { ConversationWorkEvent } from './conversationWorkEvent';
import {
  buildTimelinePresentation,
  eventToTimelineStep,
  mapWorkStatusToStepStatus,
  mapWorkTypeToStepKind
} from './timelinePresentation';

const thinking: ConversationWorkEvent = {
  id: 'tl_thinking_1',
  type: 'thinking',
  status: 'complete',
  label: 'Thinking',
  detail: 'Authentication uses JWT middleware'
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

const parentEdit: ConversationWorkEvent = {
  id: 'tl_edit_1',
  type: 'edit',
  status: 'complete',
  label: 'Edit',
  detail: 'login.ts',
  ref: { kind: 'fileEdit', id: 'fe_1' }
};

describe('timelinePresentation', () => {
  it('maps work types and statuses onto presentation kinds', () => {
    expect(mapWorkTypeToStepKind('thinking')).toBe('reasoning');
    expect(mapWorkTypeToStepKind('edit')).toBe('file');
    expect(mapWorkTypeToStepKind('read')).toBe('tool');
    expect(mapWorkStatusToStepStatus('running')).toBe('running');
    expect(mapWorkStatusToStepStatus('complete')).toBe('completed');
    expect(mapWorkStatusToStepStatus('error')).toBe('failed');
  });

  it('puts reasoning body on thinking steps', () => {
    const step = eventToTimelineStep(thinking);
    expect(step).toMatchObject({
      kind: 'reasoning',
      title: 'Thinking',
      body: 'Authentication uses JWT middleware',
      subtitle: undefined
    });
  });

  it('keeps tool path on subtitle', () => {
    const step = eventToTimelineStep({
      id: 'tl_read_1',
      type: 'read',
      status: 'complete',
      label: 'Read',
      detail: 'login.ts'
    });
    expect(step.subtitle).toBe('login.ts');
    expect(step.body).toBeUndefined();
  });

  it('groups subagent children under a header node', () => {
    const presentation = buildTimelinePresentation([
      thinking,
      header,
      childRead,
      parentEdit,
      {
        ...header,
        status: 'complete',
        label: 'Research authentication · completed',
        result: { subagentId: 'a', filesChanged: 1 }
      }
    ]);

    expect(presentation.nodes).toHaveLength(3);
    expect(presentation.nodes[0]).toMatchObject({
      kind: 'step',
      step: { id: 'tl_thinking_1', kind: 'reasoning' }
    });
    expect(presentation.nodes[1].kind).toBe('group');
    if (presentation.nodes[1].kind !== 'group') return;
    expect(presentation.nodes[1].step.title).toBe('Research authentication');
    expect(presentation.nodes[1].children.map((c) => c.id)).toEqual(['tl_sub_a_read']);
    expect(presentation.nodes[1].step.result).toEqual({
      subagentId: 'a',
      filesChanged: 1
    });
    expect(presentation.nodes[2]).toMatchObject({
      kind: 'step',
      step: { id: 'tl_edit_1', kind: 'file' }
    });
  });

  it('resolves file edit previews onto steps', () => {
    const presentation = buildTimelinePresentation([parentEdit], {
      fileEdits: [
        {
          id: 'fe_1',
          path: 'login.ts',
          additions: 3,
          deletions: 1,
          lines: [],
          toolId: 'tl_edit_1'
        }
      ]
    });
    const step = presentation.nodes[0].kind === 'step' ? presentation.nodes[0].step : null;
    expect(step?.fileEdit?.path).toBe('login.ts');
  });

  it('tracks the active running child inside a subagent group', () => {
    const presentation = buildTimelinePresentation([
      {
        id: 'tl_subagent_a',
        type: 'subagent',
        status: 'running',
        label: 'Research authentication · running',
        subagentId: 'a'
      },
      {
        id: 'tl_sub_a_read',
        type: 'read',
        status: 'running',
        label: 'Read',
        detail: 'session.ts',
        subagentId: 'a'
      }
    ]);
    expect(presentation.activeStepId).toBe('tl_sub_a_read');
    expect(presentation.summary.hasActive).toBe(true);
    expect(presentation.progressLabel).toBe('Exploring session.ts');
  });

  it('tracks the active running step', () => {
    const presentation = buildTimelinePresentation([
      {
        id: 'tl_read_live',
        type: 'read',
        status: 'running',
        label: 'Read',
        detail: 'session.ts'
      },
      {
        id: 'tl_search_done',
        type: 'search',
        status: 'complete',
        label: 'Search',
        detail: 'auth'
      }
    ]);
    expect(presentation.activeStepId).toBe('tl_read_live');
    expect(presentation.progressLabel).toBe('Exploring session.ts');
    expect(presentation.summary.hasActive).toBe(true);
    expect(presentation.summary.stepCount).toBe(1);
    expect(presentation.nodes[0]).toMatchObject({
      kind: 'explore',
      step: { title: 'Exploring 1 file, 1 search' }
    });
    if (presentation.nodes[0].kind !== 'explore') return;
    expect(presentation.nodes[0].children.map((c) => c.id)).toEqual([
      'tl_read_live',
      'tl_search_done'
    ]);
  });

  it('keeps opening thought outside explore and nests mid-thought', () => {
    const presentation = buildTimelinePresentation([
      thinking,
      {
        id: 'tl_read_1',
        type: 'read',
        status: 'complete',
        label: 'Read',
        detail: 'login.ts'
      },
      {
        id: 'tl_think_mid',
        type: 'thinking',
        status: 'complete',
        label: 'Thinking',
        detail: 'Need session next'
      },
      {
        id: 'tl_search_1',
        type: 'search',
        status: 'complete',
        label: 'Search',
        detail: 'auth'
      },
      parentEdit
    ]);
    expect(presentation.nodes.map((n) => n.kind)).toEqual(['step', 'explore', 'step']);
    expect(presentation.nodes[0]).toMatchObject({
      kind: 'step',
      step: { id: 'tl_thinking_1', kind: 'reasoning' }
    });
    if (presentation.nodes[1].kind !== 'explore') return;
    expect(presentation.nodes[1].step.title).toBe('Explored 1 file, 1 search');
    expect(presentation.nodes[1].children.map((c) => c.id)).toEqual([
      'tl_read_1',
      'tl_think_mid',
      'tl_search_1'
    ]);
    expect(presentation.nodes[2]).toMatchObject({
      kind: 'step',
      step: { id: 'tl_edit_1', kind: 'file' }
    });
  });

  it('treats flattened subagent children as a main-turn Thought / Exploring / Edit sequence', () => {
    const presentation = buildTimelinePresentation([
      {
        id: 'tl_sub_a_thought',
        type: 'thinking',
        status: 'complete',
        label: 'Thought',
        detail: 'Look at auth next'
      },
      {
        id: 'tl_sub_a_read',
        type: 'read',
        status: 'complete',
        label: 'Read',
        detail: 'login.ts'
      },
      {
        id: 'tl_sub_a_grep',
        type: 'search',
        status: 'complete',
        label: 'Grepped',
        toolName: 'grep',
        detail: 'auth'
      },
      {
        id: 'tl_sub_a_edit',
        type: 'edit',
        status: 'complete',
        label: 'Edit',
        detail: 'login.ts'
      }
    ]);
    expect(presentation.nodes.map((n) => n.kind)).toEqual(['step', 'explore', 'step']);
    expect(presentation.nodes[0]).toMatchObject({
      kind: 'step',
      step: { id: 'tl_sub_a_thought', kind: 'reasoning' }
    });
    if (presentation.nodes[1].kind !== 'explore') return;
    expect(presentation.nodes[1].step.title).toBe('Explored 1 file, 1 search');
    expect(presentation.nodes[2]).toMatchObject({
      kind: 'step',
      step: { id: 'tl_sub_a_edit', kind: 'file' }
    });
  });
});
