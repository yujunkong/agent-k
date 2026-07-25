/**
 * PendingStore - 변경사항 메모리 관리 (C2-T15)
 * 
 * 세션 간 변경사항 저장, Undo 지원
 */
export interface PendingChange {
  filePath: string;
  hunks: Array<{
    oldText: string;
    newText: string;
    applied: boolean;
  }>;
  originalContent: string;
  modifiedContent: string;
  timestamp: number;
  checkpointId?: string;
}

export class PendingStore {
  private changes: Map<string, PendingChange> = new Map();
  private history: PendingChange[] = [];

  add(change: PendingChange): void {
    this.changes.set(change.filePath, change);
    this.history.push(change);
  }

  get(filePath: string): PendingChange | undefined {
    return this.changes.get(filePath);
  }

  getAll(): PendingChange[] {
    return Array.from(this.changes.values());
  }

  remove(filePath: string): boolean {
    return this.changes.delete(filePath);
  }

  hasPending(): boolean {
    return this.changes.size > 0;
  }

  getPendingCount(): number {
    return this.changes.size;
  }

  getUndoStack(): PendingChange[] {
    return [...this.history];
  }

  popUndo(): PendingChange | undefined {
    const change = this.history.pop();
    if (change) {
      this.changes.delete(change.filePath);
    }
    return change;
  }

  clear(): void {
    this.changes.clear();
    this.history = [];
  }
}
