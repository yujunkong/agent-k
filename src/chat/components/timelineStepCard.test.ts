import { describe, expect, it } from 'vitest';
import type { TimelineStep } from '../conversation/timelinePresentation';
import { buildTimelineStepCardView } from './timelineStepCard';

describe('buildTimelineStepCardView', () => {
  it('normalizes read/search tool titles', () => {
    const step: TimelineStep = {
      id: '1',
      kind: 'tool',
      status: 'completed',
      title: 'Read',
      subtitle: 'login.ts'
    };
    expect(buildTimelineStepCardView(step)).toMatchObject({
      title: 'Read',
      subtitle: 'login.ts'
    });
  });

  it('maps subagent headers to Agent + task subtitle', () => {
    const step: TimelineStep = {
      id: 'tl_subagent_a',
      kind: 'subagent',
      status: 'running',
      title: 'Research authentication · running',
      subagentId: 'a'
    };
    expect(buildTimelineStepCardView(step)).toMatchObject({
      title: 'Agent',
      subtitle: 'Research authentication'
    });
  });

  it('shows file stats in meta', () => {
    const step: TimelineStep = {
      id: 'edit_1',
      kind: 'file',
      status: 'completed',
      title: 'Edit',
      fileEdit: {
        id: 'fe_1',
        path: 'src/auth/login.ts',
        additions: 82,
        deletions: 21,
        lines: []
      }
    };
    expect(buildTimelineStepCardView(step)).toMatchObject({
      title: 'Edit',
      subtitle: 'src/auth/login.ts',
      meta: '+82 −21',
      expandable: true
    });
  });

  it('summarizes terminal output in meta', () => {
    const step: TimelineStep = {
      id: 'term_1',
      kind: 'terminal',
      status: 'completed',
      title: 'Terminal',
      terminalRun: {
        id: 'term_1',
        command: 'npm test',
        status: 'done',
        stdout: 'Running tests\n31 tests passed',
        stderr: '',
        exitCode: 0
      }
    };
    expect(buildTimelineStepCardView(step)).toMatchObject({
      title: 'Terminal',
      subtitle: 'npm test',
      meta: '31 tests passed'
    });
  });
});
