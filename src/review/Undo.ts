/**
 * Undo - 체크포인트에서 before 스냅샷으로 복구 (C2-T17)
 */
import { CheckpointManager } from '../checkpoint/CheckpointManager';

export class UndoManager {
  private checkpointManager: CheckpointManager;

  constructor(checkpointManager: CheckpointManager) {
    this.checkpointManager = checkpointManager;
  }

  async undo(checkpointId: string): Promise<{ restored: string[]; failed: string[] }> {
    return await this.checkpointManager.restore(checkpointId);
  }

  async undoLast(): Promise<{ restored: string[]; failed: string[] }> {
    const latest = this.checkpointManager.getLatestCheckpoint();
    if (!latest) {
      return { restored: [], failed: [] };
    }
    return await this.undo(latest.id);
  }

  async undoToLabel(label: string): Promise<{ restored: string[]; failed: string[] }> {
    const checkpoints = this.checkpointManager.getCheckpoints(50);
    const target = [...checkpoints].reverse().find(c => c.label.includes(label));
    if (!target) {
      return { restored: [], failed: [] };
    }
    return await this.undo(target.id);
  }
}
