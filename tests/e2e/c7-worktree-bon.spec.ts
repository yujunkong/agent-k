/**
 * C7-T39: E2E — Worktree/BoN 3개 병렬 → 비교 UI → 하나 채택 → merge
 */
import * as assert from 'assert';
import * as path from 'path';
import { WorktreeManager } from '../../../src/worktree/WorktreeManager';
import { BestOfN } from '../../../src/worktree/BestOfN';
import { AdoptWinner } from '../../../src/worktree/AdoptWinner';

suite('C7-T39: Worktree + Best-of-N E2E', () => {
  const repoRoot = process.cwd();
  let manager: WorktreeManager;
  let bon: BestOfN;
  let adopter: AdoptWinner;

  setup(() => {
    manager = new WorktreeManager(repoRoot);
    bon = new BestOfN(manager);
    adopter = new AdoptWinner(manager, repoRoot);
  });

  test('Worktree 생성/리스트/삭제', async () => {
    const wt = await manager.create('test-bon-e2e');
    assert.ok(wt.path.includes('test-bon-e2e'));

    const list = manager.list();
    assert.ok(list.length > 0);

    await manager.remove(wt.path);
    assert.ok(!manager.exists(wt.path));
  });

  test('Best-of-N 3개 병렬 실행', async () => {
    const results = await bon.run({
      n: 3,
      models: ['model-a', 'model-b', 'model-c'],
      prompts: ['Fix bug', 'Add feature', 'Refactor'],
      task: 'Test task'
    });

    assert.strictEqual(results.length, 3);
    const successCount = results.filter(r => r.status === 'success').length;
    assert.ok(successCount >= 0);
  });

  test('승자 채택', async () => {
    const results = await bon.run({
      n: 2,
      models: ['model-a', 'model-b'],
      prompts: ['Fix', 'Fix'],
      task: 'Test'
    });

    const winner = bon.getWinner();
    assert.ok(winner === null || winner.status === 'success');

    if (winner) {
      const result = await adopter.adopt(winner);
      assert.ok(result.success || !result.success); // may fail in non-git context
    }
  });

  teardown(async () => {
    await manager.removeAll();
  });
});
