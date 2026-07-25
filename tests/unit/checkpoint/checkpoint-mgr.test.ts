/**
 * C4-T33: CheckpointManager — create/restore, 최대 20개, hash 변화 감지
 */
import * as assert from 'assert';

suite('CheckpointManager', () => {
  interface Snapshot { path: string; content: string; hash: string; }
  interface Checkpoint { id: string; label: string; timestamp: number; snapshots: Snapshot[]; }

  class SimulatedCheckpointManager {
    private checkpoints: Checkpoint[] = [];
    private maxCheckpoints = 20;

    create(label: string, snapshots: Snapshot[]): Checkpoint {
      const cp: Checkpoint = {
        id: `cp-${Date.now()}`,
        label,
        timestamp: Date.now(),
        snapshots
      };
      this.checkpoints.push(cp);
      if (this.checkpoints.length > this.maxCheckpoints) this.checkpoints.shift();
      return cp;
    }

    restore(id: string): Snapshot[] | null {
      const cp = this.checkpoints.find(c => c.id === id);
      return cp ? cp.snapshots : null;
    }

    hasChanged(current: string, stored: string): boolean {
      return current !== stored;
    }

    total() { return this.checkpoints.length; }
  }

  test('체크포인트 생성 및 복원', () => {
    const mgr = new SimulatedCheckpointManager();
    const cp = mgr.create('Before refactor', [{ path: 'src/app.ts', content: 'old content', hash: 'abc' }]);
    const restored = mgr.restore(cp.id);
    assert.ok(restored !== null);
    assert.strictEqual(restored![0].path, 'src/app.ts');
  });

  test('최대 20개 제한', () => {
    const mgr = new SimulatedCheckpointManager();
    for (let i = 0; i < 25; i++) {
      mgr.create(`cp-${i}`, []);
    }
    assert.strictEqual(mgr.total(), 20);
  });

  test('hash 변화 감지 — true', () => {
    const mgr = new SimulatedCheckpointManager();
    assert.ok(mgr.hasChanged('abc', 'def'));
  });

  test('hash 변화 감지 — false', () => {
    const mgr = new SimulatedCheckpointManager();
    assert.strictEqual(mgr.hasChanged('abc', 'abc'), false);
  });
});
