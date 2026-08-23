/**
 * SUB-010 — parent must receive the full child conclusion (not a 12k stub).
 */
import { describe, expect, it } from 'vitest';
import {
  formatParentSubagentToolText,
  parentResultFromTask,
} from './subagentHost';
import type { SubagentTask } from '@agent-k/core';

function baseTask(over: Partial<SubagentTask> = {}): SubagentTask {
  return {
    id: 'subagent-test-1',
    parentTurnId: '1',
    prompt: 'fix E0774 in ui/src/lib.rs',
    role: 'coding',
    status: 'completed',
    createdAt: 1_000,
    startedAt: 1_000,
    completedAt: 5_000,
    result: '',
    ...over,
  };
}

describe('parentResultFromTask', () => {
  it('passes full conclusion without 12k truncation', () => {
    const long = `결론\n${'본문 라인입니다. '.repeat(2000)}끝.`;
    expect(long.length).toBeGreaterThan(12_000);
    const out = parentResultFromTask(baseTask({ result: long }));
    expect(String(out.data?.summary)).toBe(long);
    expect(String(out.data?.result)).toBe(long);
    expect(String(out.data?.parentToolText)).toContain(long);
    expect(String(out.data?.parentToolText)).not.toMatch(/…\s*$/);
  });

  it('formats plain parentToolText for the parent AgentLoop', () => {
    const text = formatParentSubagentToolText({
      role: 'coding',
      status: 'completed',
      durationMs: 4000,
      filesChanged: 0,
      worktreePath: '/tmp/wt',
      conclusion: 'worktree HEAD만 보여 uncommitted 변경을 못 봄.',
    });
    expect(text).toContain('Subagent (coding)');
    expect(text).toContain('filesChanged: 0');
    expect(text).toContain('---');
    expect(text).toContain('uncommitted');
  });
});
