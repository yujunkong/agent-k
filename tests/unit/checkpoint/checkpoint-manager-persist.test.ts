/**
 * ADDON-T07: CheckpointManager — maxCheckpoints=50, list(), disk persistence
 * via setPersistRoot(<root>/.agentk/checkpoints/index.json). Uses the real
 * class (tests/unit/checkpoint/checkpoint-mgr.test.ts covers the older
 * simulated 20-cap behavior for C4-T33).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CheckpointManager } from '../../../src/checkpoint/CheckpointManager';

function makeTmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-cp-'));
}

function rmrf(p: string): void {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

suite('ADDON-T07 CheckpointManager', () => {
  test('prunes to 50 checkpoints max', async () => {
    const mgr = new CheckpointManager();
    for (let i = 0; i < 60; i++) {
      await mgr.createCheckpoint([], `cp-${i}`, {
        turnNumber: i,
        mode: 'agent',
        trigger: 'user_request'
      });
    }
    assert.strictEqual(mgr.list().length, 50);
    // Oldest 10 dropped — earliest surviving label is cp-10
    assert.strictEqual(mgr.list()[0].label, 'cp-10');
    assert.strictEqual(mgr.list()[49].label, 'cp-59');
  });

  test('list() aliases getCheckpoints(50)', async () => {
    const mgr = new CheckpointManager();
    await mgr.createCheckpoint([], 'a', { turnNumber: 1, mode: 'agent', trigger: 'first_write' });
    await mgr.createCheckpoint([], 'b', { turnNumber: 2, mode: 'agent', trigger: 'n_files' });
    assert.deepStrictEqual(mgr.list(), mgr.getCheckpoints(50));
    assert.strictEqual(mgr.list().length, 2);
  });

  test('setPersistRoot writes .agentk/checkpoints/index.json on create', async () => {
    const root = makeTmpRoot();
    try {
      const mgr = new CheckpointManager();
      mgr.setPersistRoot(root);
      await mgr.createCheckpoint([], 'disk-cp', {
        turnNumber: 1,
        mode: 'agent',
        trigger: 'dangerous_tool'
      });
      const file = path.join(root, '.agentk', 'checkpoints', 'index.json');
      assert.ok(fs.existsSync(file), 'index.json should be created');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      assert.strictEqual(parsed.length, 1);
      assert.strictEqual(parsed[0].label, 'disk-cp');
    } finally {
      rmrf(root);
    }
  });

  test('setPersistRoot loads a previously persisted index', async () => {
    const root = makeTmpRoot();
    try {
      const mgr1 = new CheckpointManager();
      mgr1.setPersistRoot(root);
      await mgr1.createCheckpoint([], 'from-disk', {
        turnNumber: 1,
        mode: 'agent',
        trigger: 'user_request'
      });

      // Fresh instance, same root — should hydrate from disk
      const mgr2 = new CheckpointManager();
      mgr2.setPersistRoot(root);
      assert.strictEqual(mgr2.list().length, 1);
      assert.strictEqual(mgr2.list()[0].label, 'from-disk');
    } finally {
      rmrf(root);
    }
  });

  test('clear() empties in-memory list and persists the empty index', () => {
    const root = makeTmpRoot();
    try {
      const mgr = new CheckpointManager();
      mgr.setPersistRoot(root);
      mgr.clear();
      const file = path.join(root, '.agentk', 'checkpoints', 'index.json');
      assert.ok(fs.existsSync(file));
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf-8')), []);
    } finally {
      rmrf(root);
    }
  });

  test('works without setPersistRoot (no disk I/O, in-memory only)', async () => {
    const mgr = new CheckpointManager();
    const cp = await mgr.createCheckpoint([], 'mem-only', {
      turnNumber: 1,
      mode: 'agent',
      trigger: 'first_write'
    });
    assert.strictEqual(mgr.list().length, 1);
    assert.strictEqual(mgr.getLatestCheckpoint()?.id, cp.id);
  });
});
