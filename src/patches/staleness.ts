/**
 * Staleness Check - 마지막 read 이후 변경 감지 (C2-T06)
 * 
 * mtime + content hash로 파일 변경 추적
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
        hash: this.simpleHash(content)
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
      return true; // File deleted
    }
  }

  getStaleFiles(filePaths: string[]): string[] {
    return filePaths.filter(f => this.isStale(f));
  }

  getStalenessInfo(filePath: string): { stale: boolean; lastRead?: Date; currentMtime?: Date } | null {
    const snapshot = this.snapshots.get(filePath);
    if (!snapshot) return null;

    try {
      const stat = fs.statSync(filePath);
      return {
        stale: stat.mtimeMs !== snapshot.mtime,
        lastRead: new Date(snapshot.mtime),
        currentMtime: new Date(stat.mtimeMs)
      };
    } catch {
      return { stale: true, lastRead: new Date(snapshot.mtime) };
    }
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
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(36);
  }
}
