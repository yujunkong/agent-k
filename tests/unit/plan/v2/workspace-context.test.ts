import * as assert from 'assert';
import {
  appendWorkspaceContextToResearch,
  assertMatchingRepoRoot,
  formatTaskFileTargets,
  normalizeRepoRoot,
  repoRootsMatch,
  unresolvedModifyOrReadTargets
} from '../../../../src/plan/v2/workspaceContext';

suite('Plan V2 — workspaceContext', () => {
  test('normalizeRepoRoot and repoRootsMatch ignore slashes and case', () => {
    assert.strictEqual(normalizeRepoRoot('D:\\workspace\\agent-k\\'), 'D:/workspace/agent-k');
    assert.strictEqual(repoRootsMatch('D:/workspace/agent-k', 'd:\\workspace\\agent-k\\'), true);
    assert.strictEqual(repoRootsMatch('/a', '/b'), false);
  });

  test('appendWorkspaceContextToResearch includes repo root and file index', () => {
    const text = appendWorkspaceContextToResearch('Research notes here', {
      repoRoot: '/workspace/agent-k',
      fileIndex: ['src/chat/ChatApp.tsx', 'src/host/planGenerate.ts']
    });
    assert.ok(text.includes('Repository root: /workspace/agent-k'));
    assert.ok(text.includes('src/chat/ChatApp.tsx'));
    assert.ok(text.includes('Do not invent paths'));
  });

  test('assertMatchingRepoRoot throws on mismatch', () => {
    assert.throws(
      () =>
        assertMatchingRepoRoot({
          expected: '/workspace/agent-k',
          actual: '/other/repo',
          stage: 'execution'
        }),
      /repoRoot mismatch/i
    );
    assert.doesNotThrow(() =>
      assertMatchingRepoRoot({
        expected: '/workspace/agent-k',
        actual: '/workspace/agent-k',
        stage: 'execution'
      })
    );
  });

  test('formatTaskFileTargets and unresolvedModifyOrReadTargets', () => {
    const formatted = formatTaskFileTargets([
      { path: 'src/main.rs', intent: 'modify', resolution: 'unresolved', exists: false },
      { path: 'src/new.ts', intent: 'create', resolution: 'resolved', exists: false }
    ]);
    assert.ok(formatted.includes('src/main.rs (modify, unresolved)'));
    assert.ok(formatted.includes('src/new.ts (create)'));

    const unresolved = unresolvedModifyOrReadTargets([
      { path: 'src/main.rs', intent: 'modify', resolution: 'unresolved' },
      { path: 'src/new.ts', intent: 'create', resolution: 'resolved' },
      { path: 'src/auth.ts', intent: 'read', resolution: 'unresolved' }
    ]);
    assert.strictEqual(unresolved.length, 2);
    assert.strictEqual(unresolved[0]?.path, 'src/main.rs');
    assert.strictEqual(unresolved[1]?.path, 'src/auth.ts');
  });
});
