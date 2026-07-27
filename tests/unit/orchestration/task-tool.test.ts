/**
 * ADDON-T09: SubAgentResult summarization + formatTaskToolResult (pure)
 */
import * as assert from 'assert';
import { SubAgentResult, type SubAgentRawResult } from '../../../src/tools/orchestration/SubAgentResult';
import { formatTaskToolResult, taskResultToSummary, type TaskResult } from '../../../src/tools/orchestration/TaskTool';

suite('ADDON-T09 SubAgentResult', () => {
  const sub = new SubAgentResult();

  test('summarize: completed status extracts a meaningful summary', () => {
    // SubAgentResult.generateSummary only picks lines starting with
    // '## Summary' / 'Result:' / '-' — matches TaskTool's runSubAgent fullLog shape.
    const raw: SubAgentRawResult = {
      taskId: 'task-1',
      fullLog: ['## Summary', '- fix bug — completed (3 turns)', '- Mode: agent'].join('\n'),
      toolCalls: 4,
      tokensUsed: { input: 100, output: 50 },
      duration: 2500,
      status: 'completed'
    };
    const summary = sub.summarize(raw);
    assert.strictEqual(summary.taskId, 'task-1');
    assert.strictEqual(summary.status, 'completed');
    assert.strictEqual(summary.toolCalls, 4);
    assert.ok(summary.summary.includes('fix bug'));
    assert.strictEqual(summary.truncated, false);
  });

  test('summarize: error status never leaks raw log, only the error message', () => {
    const raw: SubAgentRawResult = {
      taskId: 'task-2',
      fullLog: 'irrelevant raw transcript that should not leak',
      toolCalls: 0,
      tokensUsed: { input: 0, output: 0 },
      duration: 10,
      status: 'error',
      error: 'ENOENT: file not found'
    };
    const summary = sub.summarize(raw);
    assert.ok(summary.summary.includes('ENOENT'));
    assert.ok(!summary.summary.includes('irrelevant raw transcript'));
  });

  test('summarize: timeout status has a fixed advisory message', () => {
    const raw: SubAgentRawResult = {
      taskId: 'task-3',
      fullLog: '',
      toolCalls: 0,
      tokensUsed: { input: 0, output: 0 },
      duration: 120000,
      status: 'timeout'
    };
    const summary = sub.summarize(raw);
    assert.ok(/timed out/i.test(summary.summary));
  });

  test('summarize: truncates summaries over the max length', () => {
    // generateSummary only keeps the first 5 matching lines — make each one
    // long enough that 5 lines alone exceed the 2000-char summary cap.
    const longLog = Array.from({ length: 5 }, (_, i) => `- line ${i} ${'x'.repeat(500)}`).join('\n');
    const raw: SubAgentRawResult = {
      taskId: 'task-4',
      fullLog: longLog,
      toolCalls: 1,
      tokensUsed: { input: 0, output: 0 },
      duration: 1,
      status: 'completed'
    };
    const summary = sub.summarize(raw);
    // truncate() slices to ~maxLength then appends a "(truncated, N chars omitted)"
    // suffix, so the result stays close to (not exactly under) the 2000-char cap.
    assert.ok(summary.summary.length < longLog.length);
    assert.ok(summary.summary.includes('truncated'));
    assert.strictEqual(summary.truncated, true);
  });

  test('estimateContextCost / isMeaningful sanity', () => {
    const summary = sub.summarize({
      taskId: 't',
      fullLog: '## Summary\nsome real work happened here in detail',
      toolCalls: 2,
      tokensUsed: { input: 0, output: 0 },
      duration: 1,
      status: 'completed'
    });
    assert.ok(sub.estimateContextCost(summary) > 0);
    assert.strictEqual(sub.isMeaningful(summary), summary.summary.length >= 50);
  });
});

suite('ADDON-T09 formatTaskToolResult', () => {
  test('formats a completed summary with duration + tool call count', () => {
    const text = formatTaskToolResult({
      taskId: 'task-5',
      summary: 'Implemented the feature and ran tests.',
      toolCalls: 6,
      tokensUsed: { input: 0, output: 0 },
      duration: 4500,
      status: 'completed',
      truncated: false
    });
    assert.ok(text.includes('task-5'));
    assert.ok(text.includes('completed'));
    assert.ok(text.includes('4.5s'));
    assert.ok(text.includes('6 tool call'));
    assert.ok(text.includes('Implemented the feature'));
  });

  test('appends a truncated marker when the summary was truncated', () => {
    const text = formatTaskToolResult({
      taskId: 'task-6',
      summary: 'partial...',
      toolCalls: 1,
      tokensUsed: { input: 0, output: 0 },
      duration: 100,
      status: 'completed',
      truncated: true
    });
    assert.ok(/truncated/i.test(text));
  });

  test('taskResultToSummary round-trips a TaskResult for formatting', () => {
    const result: TaskResult = {
      taskId: 'task-7',
      summary: 'Sub-agent cancelled by parent before completion.',
      status: 'cancelled',
      duration: 3000
    };
    const summary = taskResultToSummary(result);
    assert.strictEqual(summary.taskId, 'task-7');
    assert.strictEqual(summary.status, 'cancelled');
    const text = formatTaskToolResult(summary);
    assert.ok(text.includes('cancelled'));
    assert.ok(text.includes('Sub-agent cancelled by parent'));
  });

  test('cancelled and timeout are distinct statuses', () => {
    const cancelled: TaskResult = { taskId: 'a', summary: 'x', status: 'cancelled', duration: 1 };
    const timedOut: TaskResult = { taskId: 'b', summary: 'y', status: 'timeout', duration: 1 };
    assert.notStrictEqual(cancelled.status, timedOut.status);
  });
});
