import { describe, expect, it } from 'vitest';
import {
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
});
