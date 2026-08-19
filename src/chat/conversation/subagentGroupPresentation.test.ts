import { describe, expect, it } from 'vitest';
import {
  buildSubagentGroupPresentation,
  buildTimelinePresentation,
  visibleSubagentChildren,
  type TimelineStep
} from './timelinePresentation';

describe('subagent group presentation', () => {
  const fileChild: TimelineStep = {
    id: 'edit_1',
    kind: 'file',
    status: 'completed',
    title: 'Edit',
    subtitle: 'src/auth/login.ts',
    subagentId: 'a'
  };

  const readChild: TimelineStep = {
    id: 'read_1',
    kind: 'tool',
    status: 'completed',
    title: 'Read',
    subtitle: 'session.ts',
    subagentId: 'a'
  };

  const header: TimelineStep = {
    id: 'tl_subagent_a',
    kind: 'subagent',
    status: 'completed',
    title: 'Research authentication · completed',
    subagentId: 'a',
    result: {
      subagentId: 'a',
      filesChanged: 2,
      worktreeReview: {
        files: ['src/auth/login.ts', 'src/auth/session.ts'],
        diff: ''
      }
    }
  };

  it('suppresses file edit children when final worktree changes exist', () => {
    const presentation = buildSubagentGroupPresentation(header, [fileChild, readChild]);
    expect(presentation.suppressFileEdits).toBe(true);
    expect(presentation.changesPhase).toBe('final');
    expect(visibleSubagentChildren([fileChild, readChild], presentation).map((s) => s.id)).toEqual([
      'read_1'
    ]);
  });

  it('keeps compact file edits visible while subagent is running', () => {
    const running = { ...header, status: 'running' as const, result: undefined };
    const presentation = buildSubagentGroupPresentation(running, [fileChild]);
    expect(presentation.compactFileEdits).toBe(true);
    expect(presentation.changesPhase).toBe('progress');
    expect(presentation.suppressFileEdits).toBe(false);
  });

  it('finalizes subagent metadata on timeline nodes', () => {
    const timeline = buildTimelinePresentation([
      {
        id: 'tl_subagent_a',
        type: 'subagent',
        status: 'complete',
        label: 'Research authentication · completed',
        subagentId: 'a',
        result: { subagentId: 'a', filesChanged: 1 }
      },
      {
        id: 'edit_1',
        type: 'edit',
        status: 'complete',
        label: 'Edit',
        detail: 'login.ts',
        subagentId: 'a'
      },
      {
        id: 'read_1',
        type: 'read',
        status: 'complete',
        label: 'Read',
        detail: 'session.ts',
        subagentId: 'a'
      }
    ]);
    expect(timeline.nodes).toHaveLength(1);
    const group = timeline.nodes[0];
    if (group.kind !== 'group') return;
    expect(group.subagent.suppressFileEdits).toBe(true);
    expect(visibleSubagentChildren(group.children, group.subagent)).toHaveLength(1);
    expect(timeline.summary.stepCount).toBe(2);
  });
});
