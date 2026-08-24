/**
 * CTX-006 Workspace index — ported from v2.1 `src/indexing/WorkspaceIndexer.ts`.
 * C4-T28: indexing pipeline (symbol extract + path search).
 * vscode.workspace calls replaced by injected {@link WorkspaceFs}.
 */
import type { WorkspaceFs } from './WorkspaceFs';

export interface IndexEntry {
  filePath: string;
  symbols: string[];
  lastModified: number;
  contentHash: string;
}

export class WorkspaceIndexer {
  private index = new Map<string, IndexEntry>();
  private ignorePatterns = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'];
  private fs: WorkspaceFs;

  constructor(fs: WorkspaceFs) {
    this.fs = fs;
  }

  /**
   * Build (or rebuild) the in-memory index via injected WorkspaceFs.
   * `workspaceRoot` is retained for API parity / host logging; findTextFiles
   * is expected to already be scoped to that root by the host adapter.
   */
  async buildIndex(_workspaceRoot?: string): Promise<void> {
    const files = await this.fs.findTextFiles({
      include: '**/*.{ts,tsx,js,jsx,json,md}',
      exclude: `{${this.ignorePatterns.join(',')}}`,
    });

    for (const file of files) {
      const symbols = this.extractSymbols(file.text);
      this.index.set(file.fsPath, {
        filePath: file.fsPath,
        symbols,
        lastModified: Date.now(),
        contentHash: this.simpleHash(file.text),
      });
    }
  }

  private extractSymbols(text: string): string[] {
    const symbols: string[] = [];
    // Class/function/interface exports (same regex as v2.1)
    const pattern = /export\s+(class|function|interface|type|const|enum)\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      symbols.push(match[2]);
    }
    return symbols;
  }

  private simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 1000); i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  findSymbol(symbol: string): IndexEntry[] {
    const results: IndexEntry[] = [];
    for (const entry of this.index.values()) {
      if (entry.symbols.includes(symbol)) {
        results.push(entry);
      }
    }
    return results;
  }

  searchFiles(query: string): string[] {
    const lower = query.toLowerCase();
    return Array.from(this.index.keys()).filter((f) => f.toLowerCase().includes(lower));
  }

  getIndexSize(): number {
    return this.index.size;
  }
}
