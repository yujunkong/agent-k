/**
 * Undo — REVIEW-006: 체크포인트에서 before 스냅샷으로 복구 (v2.1 C2-T17 동작 동등 이식)
 *
 * 현재 safety CheckpointManager는 snapshot-map-only 계약 — restore는
 * 스냅샷 맵만 반환하고 host/tools가 적용한다 (fs 쓰기 없음).
 */
import { CheckpointManager } from '@agent-k/safety';

export interface UndoResult {
  restored: string[];
  failed: string[];
}

export class UndoManager {
  private checkpointManager: CheckpointManager;

  constructor(checkpointManager: CheckpointManager) {
    this.checkpointManager = checkpointManager;
  }

  async undo(checkpointId: string): Promise<UndoResult> {
    const result = this.checkpointManager.restore(checkpointId);
    if (!result.ok) {
      return { restored: [], failed: [checkpointId] };
    }
    return {
      restored: result.value.fileSnapshots.map((s) => s.filePath),
      failed: [],
    };
  }

  async undoLast(): Promise<UndoResult> {
    const checkpoints = this.checkpointManager.list();
    const latest = checkpoints[checkpoints.length - 1];
    if (!latest) {
      return { restored: [], failed: [] };
    }
    return await this.undo(latest.id);
  }

  async undoToLabel(label: string): Promise<UndoResult> {
    const checkpoints = this.checkpointManager.list();
    const target = [...checkpoints].reverse().find((c) => c.label.includes(label));
    if (!target) {
      return { restored: [], failed: [] };
    }
    return await this.undo(target.id);
  }
}
