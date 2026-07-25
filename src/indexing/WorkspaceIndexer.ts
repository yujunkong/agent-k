/**
 * WorkspaceIndexer - 워크스페이스 파일 인덱싱 및 심볼 검색
 * C4-T28: 인덱싱 파이프라인
 */
import * as vscode from 'vscode';

interface IndexEntry {
  filePath: string;
  symbols: string[];
  lastModified: number;
  contentHash: string;
}

export class WorkspaceIndexer {
  private index = new Map<string, IndexEntry>();
  private ignorePatterns = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'];

  async buildIndex(workspaceUri: vscode.Uri): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,json,md}', 
      `{${this.ignorePatterns.join(',')}}`);
    
    for (const file of files) {
      const doc = await vscode.workspace.openTextDocument(file);
      const text = doc.getText();
      const symbols = this.extractSymbols(text);
      
      this.index.set(file.fsPath, {
        filePath: file.fsPath,
        symbols,
        lastModified: Date.now(),
        contentHash: this.simpleHash(text)
      });
    }
  }

  private extractSymbols(text: string): string[] {
    const symbols: string[] = [];
    // Class/function/interface exports
    const pattern = /export\s+(class|function|interface|type|const|enum)\s+(\w+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      symbols.push(match[2]);
    }
    return symbols;
  }

  private simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 1000); i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
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
    return Array.from(this.index.keys()).filter(f => f.toLowerCase().includes(lower));
  }

  getIndexSize(): number { return this.index.size; }
}
