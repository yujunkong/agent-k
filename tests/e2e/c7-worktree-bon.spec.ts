/**
 * C7-T38/T39: E2E — Worktree + BestOfN 실 공개 API (RW-C57-03-R2)
 *
 * 착각 금지: addCandidate / candidateCount / runAll 은 BestOfN에 없음.
 * 공개 API: constructor(WorktreeManager), run(BoNConfig), getResults(), getWinner(), adoptWinner(), cleanup()
 */
import * as assert from 'assert';
import { WorktreeManager } from '../../src/worktree/WorktreeManager';
import { BestOfN } from '../../src/worktree/BestOfN';

suite('E2E: WorktreeManager API (C7-T38)', () => {
  test('WorktreeManager 생성 및 공개 메서드', () => {
    const mgr = new WorktreeManager('/tmp/test-wt-e2e');
    assert.ok(mgr);
    assert.strictEqual(typeof mgr.create, 'function');
    assert.strictEqual(typeof mgr.list, 'function');
    assert.strictEqual(typeof mgr.remove, 'function');
  });

  test('list() — 존재하지 않는 경로에서 빈 배열/예외 없이 동작', () => {
    const mgr = new WorktreeManager('/nonexistent-path-agentk-e2e');
    const list = mgr.list();
    assert.ok(Array.isArray(list));
  });
});

suite('E2E: BestOfN 공개 API (C7-T39 / RW-C57-03-R2)', () => {
  test('BestOfN(manager) 초기 상태 — getResults/getWinner', () => {
    const mgr = new WorktreeManager('/tmp/test-bon-e2e');
    const bon = new BestOfN(mgr);
    assert.deepStrictEqual(bon.getResults(), []);
    assert.strictEqual(bon.getWinner(), null);
  });

  test('공개 API surface — run / adoptWinner / cleanup 존재', () => {
    const mgr = new WorktreeManager('/tmp/test-bon-e2e');
    const bon = new BestOfN(mgr);
    assert.strictEqual(typeof bon.run, 'function');
    assert.strictEqual(typeof bon.getResults, 'function');
    assert.strictEqual(typeof bon.getWinner, 'function');
    assert.strictEqual(typeof bon.adoptWinner, 'function');
    assert.strictEqual(typeof bon.cleanup, 'function');
    // Ensure fake APIs are NOT present
    assert.strictEqual((bon as any).addCandidate, undefined);
    assert.strictEqual((bon as any).candidateCount, undefined);
    assert.strictEqual((bon as any).runAll, undefined);
  });
});
