/**
 * CheckpointManager - 스냅샷 기반 롤백 (C4-T03/C4-T04/C4-T06)
 * 
 * 첫 쓰기 전 / N파일 이상 / 사용자 요청 / 위험 도구 직전 체크포인트 생성
 * 복구: 스냅샷 파일만 복구, untracked 삭제 정책
 */
import * as fs from 'fs';
import * as path from 'path';

export interface Checkpoint {
  id: string;
  timestamp: number;
  label: string;
  fileSnapshots: FileSnapshot[];
  metadata: {
    turnNumber: number;
    mode: string;
    trigger: 'first_write' | 'n_files' | 'user_request' | 'dangerous_tool';
  };
}

export interface FileSnapshot {
  filePath: string;
  content: string;
  hash: string;
}

export class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private readonly maxCheckpoints = 20;
  private lastSnapshotHashes: Map<string, string> = new Map();

  async createCheckpoint(
    files: string[],
    label: string,
    metadata: Checkpoint['metadata']
  ): Promise<Checkpoint> {
    const snapshots: FileSnapshot[] = [];

    for (const filePath of files) {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          snapshots.push({
            filePath,
            content,
            hash: this.simpleHash(content)
          });
        }
      } catch (error) {
        console.warn(`[Checkpoint] Cannot snapshot ${filePath}:`, error);
      }
    }

    const checkpoint: Checkpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      label,
      fileSnapshots: snapshots,
      metadata
    };

    this.checkpoints.push(checkpoint);

    // Cap
    if (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints = this.checkpoints.slice(-this.maxCheckpoints);
    }

    return checkpoint;
  }

  async restore(checkpointId: string): Promise<{ restored: string[]; failed: string[] }> {
    const checkpoint = this.checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const restored: string[] = [];
    const failed: string[] = [];

    for (const snapshot of checkpoint.fileSnapshots) {
      try {
        // Ensure directory exists
        const dir = path.dirname(snapshot.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(snapshot.filePath, snapshot.content, 'utf-8');
        restored.push(snapshot.filePath);
      } catch (error) {
        failed.push(snapshot.filePath);
      }
    }

    return { restored, failed };
  }

  getLatestCheckpoint(): Checkpoint | undefined {
    return this.checkpoints[this.checkpoints.length - 1];
  }

  getCheckpoints(limit = 10): Checkpoint[] {
    return this.checkpoints.slice(-limit);
  }

  hasChanged(filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath)) return true;
      const content = fs.readFileSync(filePath, 'utf-8');
      const hash = this.simpleHash(content);
      const last = this.lastSnapshotHashes.get(filePath);
      return hash !== last;
    } catch {
      return true;
    }
  }

  updateHash(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.lastSnapshotHashes.set(filePath, this.simpleHash(content));
      }
    } catch { /* ignore */ }
  }

  clear(): void {
    this.checkpoints = [];
    this.lastSnapshotHashes.clear();
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}
