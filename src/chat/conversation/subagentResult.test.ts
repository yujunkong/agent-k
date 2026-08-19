import { describe, expect, it } from 'vitest';
import {
  applyHostWorktreeApplyResult,
  applyHostWorktreeRejectResult,
  applyHostWorktreeReviewResult,
  beginSubagentWorktreeAction,
  canApplySubagentWorktree,
  canRejectSubagentWorktree,
  formatSubagentDuration,
  formatSubagentFilesChanged,
  formatSubagentToolCount,
  parseSubagentResult
} from './subagentResult';

describe('parseSubagentResult', () => {
  it('reads filesChanged, toolCount, and duration from the completion payload', () => {
    expect(
      parseSubagentResult({
        taskId: 'subagent-1',
        worktreePath: '/tmp/wt/subagent-1',
        summary: 'Authentication flow is handled in session.ts.',
        filesChanged: 2,
        toolCount: 14,
        duration: 8400
      })
    ).toEqual({
      subagentId: 'subagent-1',
      worktreePath: '/tmp/wt/subagent-1',
      summary: 'Authentication flow is handled in session.ts.',
      filesChanged: 2,
      toolCount: 14,
      durationMs: 8400
    });
  });

  it('does not copy a child transcript into the result', () => {
    const result = parseSubagentResult({
      summary: 'Authentication flow is handled in session.ts.',
      result: 'full child answer\n'.repeat(40),
      transcript: 'Thought: ...\nRead auth.ts\n',
      filesChanged: 2,
      toolCount: 14,
      durationMs: 8400
    });
    expect(result?.summary).toBe('Authentication flow is handled in session.ts.');
    expect(JSON.stringify(result)).not.toContain('Thought:');
    expect(JSON.stringify(result)).not.toContain('full child answer');
  });

  it('formats compact result rows', () => {
    expect(formatSubagentFilesChanged(2)).toBe('2 files changed');
    expect(formatSubagentToolCount(14)).toBe('14 tools');
    expect(formatSubagentDuration(8400)).toBe('8.4s');
  });

  it('tracks worktree apply/reject lifecycle on host results', () => {
    const base = {
      subagentId: 'subagent-1',
      summary: 'done',
      filesChanged: 1
    };
    const applying = beginSubagentWorktreeAction(base, 'applying');
    expect(applying.worktreeAction).toBe('applying');
    expect(canApplySubagentWorktree(applying)).toBe(false);

    const applied = applyHostWorktreeApplyResult(applying, {
      success: true,
      applied: true
    });
    expect(applied.worktreeOutcome).toBe('applied');
    expect(canApplySubagentWorktree(applied)).toBe(false);
    expect(canRejectSubagentWorktree(applied)).toBe(false);

    const failed = applyHostWorktreeApplyResult(base, {
      success: false,
      error: 'parent dirty'
    });
    expect(failed.worktreeOutcome).toBe('apply_failed');
    expect(canApplySubagentWorktree(failed)).toBe(true);

    const rejecting = beginSubagentWorktreeAction(base, 'rejecting');
    const rejected = applyHostWorktreeRejectResult(rejecting, { success: true });
    expect(rejected.worktreeOutcome).toBe('rejected');

    const rejectFailed = applyHostWorktreeRejectResult(base, {
      success: false,
      error: 'git error'
    });
    expect(rejectFailed.worktreeOutcome).toBe('reject_failed');
    expect(canRejectSubagentWorktree(rejectFailed)).toBe(true);

    const reviewed = applyHostWorktreeReviewResult(base, {
      success: true,
      files: ['src/a.ts'],
      diff: '+++ diff',
      filesChanged: 1
    });
    expect(reviewed.worktreeReview?.files).toEqual(['src/a.ts']);
    expect(reviewed.worktreeAction).toBe('idle');
  });
});
