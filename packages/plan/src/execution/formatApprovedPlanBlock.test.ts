/**
 * PLAN-009 — approved plan sticky block formatter.
 */
import { describe, expect, it } from 'vitest';
import { formatApprovedPlanBlock } from './formatApprovedPlanBlock';
import type { ExecutionPlan } from './types';

function samplePlan(): ExecutionPlan {
  return {
    id: 'plan_1',
    goal: 'Ship PLAN-009',
    status: 'approved',
    approvedTaskIds: ['t1', 't2'],
    createdAt: 1,
    repoRoot: '/tmp/repo',
    tasks: [
      {
        id: 't1',
        title: 'Formatter',
        description: 'Add formatApprovedPlanBlock',
        dependencies: [],
        files: [{ path: 'packages/plan/src/index.ts', intent: 'modify' }],
        verification: ['npm test -w @agent-k/plan'],
        execution: 'main',
        status: 'ready',
      },
      {
        id: 't2',
        title: 'Wire host',
        description: 'Inject into AgentLoop',
        dependencies: ['t1'],
        files: [],
        verification: [],
        execution: 'subagent',
        status: 'pending',
      },
    ],
  };
}

describe('formatApprovedPlanBlock (PLAN-009)', () => {
  it('returns empty string when plan has no tasks', () => {
    expect(formatApprovedPlanBlock({ ...samplePlan(), tasks: [] })).toBe('');
  });

  it('includes goal, workspace, tasks, and enforcement header', () => {
    const block = formatApprovedPlanBlock(samplePlan());
    expect(block).toContain('## APPROVED PLAN');
    expect(block).toContain('**Goal:** Ship PLAN-009');
    expect(block).toContain('**Workspace:** /tmp/repo');
    expect(block).toContain('**t1** [ready/main]: Formatter');
    expect(block).toContain('verify: npm test -w @agent-k/plan');
    expect(block).toContain('depends: t1');
  });

  it('highlights the current task focus', () => {
    const block = formatApprovedPlanBlock(samplePlan(), { currentTaskId: 't2' });
    expect(block).toContain('→ **t2**');
    expect(block).toContain('### Current focus');
    expect(block).toContain('Execute **t2**: Wire host only.');
  });
});
