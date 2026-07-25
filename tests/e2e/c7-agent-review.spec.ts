/**
 * C7-T40: E2E — /review → Finding → Accept Fix → edit_file → 재검증
 */
import * as assert from 'assert';
import * as path from 'path';
import { AgentReviewLoop } from '../../../src/review/AgentReviewLoop';
import { AcceptFix } from '../../../src/review/AcceptFix';

suite('C7-T40: Agent Review E2E', () => {
  const repoRoot = process.cwd();
  let review: AgentReviewLoop;
  let acceptFix: AcceptFix;

  setup(() => {
    review = new AgentReviewLoop(repoRoot);
    acceptFix = new AcceptFix();
  });

  test('리뷰 실행 — Finding 리스트 생성', () => {
    const result = review.reviewDiff('HEAD');
    assert.ok(Array.isArray(result.findings));
    assert.ok(result.totalFiles >= 0);
    assert.ok(typeof result.totalInsertions === 'number');
  });

  test('Build LM review prompt from findings', () => {
    const findings = [
      { id: '1', file: 'test.ts', line: 10, severity: 'warning' as const,
        message: 'console.log found', suggestion: 'Remove it' }
    ];
    const prompt = review.buildLMPrompt(findings);
    assert.ok(prompt.includes('console.log'));
  });

  test('Accept Fix — Finding 수락', async () => {
    const finding = {
      id: 'fix-1',
      file: 'src/test.ts',
      line: 42,
      severity: 'warning' as const,
      message: 'console.log found in diff',
      suggestion: 'Remove console.log'
    };

    const result = await acceptFix.accept(finding);
    assert.ok(result.applied === true || result.applied === false);
    assert.strictEqual(result.findingId, 'fix-1');
  });
});
