/**
 * Staleness check (mtime + content hash) — supports WT-009 pre-apply guards.
 * Ported from v2.1 `src/patches/staleness.ts` (no CheckpointManager).
 */
import * as fs from 'fs';

interface FileSnapshot {
  mtime: number;
  hash: string;
}

export class StalenessChecker {
  private snapshots: Map<string, FileSnapshot> = new Map();

  recordRead(filePath: string): void {
    try {
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      this.snapshots.set(filePath, {
        mtime: stat.mtimeMs,
        hash: this.simpleHash(content),
      });
    } catch {
      this.snapshots.delete(filePath);
    }
  }

  isStale(filePath: string): boolean {
    const snapshot = this.snapshots.get(filePath);
    if (!snapshot) return true;

    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs !== snapshot.mtime) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return this.simpleHash(content) !== snapshot.hash;
      }
      return false;
    } catch {
      return true;
    }
  }

  getStaleFiles(filePaths: string[]): string[] {
    return filePaths.filter((f) => this.isStale(f));
  }

  clear(): void {
    this.snapshots.clear();
  }

  remove(filePath: string): void {
    this.snapshots.delete(filePath);
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(36);
  }
}
