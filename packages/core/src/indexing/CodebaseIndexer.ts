/**
 * CTX-007 Codebase index — ported from v2.1 `src/indexing/CodebaseIndexer.ts`.
 * Chunk + persist + @codebase substring search (C7-T30). Uses node:fs (same as v2.1).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface IndexedChunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  hash: string;
  indexedAt: number;
}

export class CodebaseIndexer {
  private chunks: IndexedChunk[] = [];
  private indexDir: string;
  private readonly CHUNK_SIZE = 50; // lines per chunk
  private readonly MAX_FILE_SIZE_MB = 1;

  constructor(indexDir: string) {
    this.indexDir = indexDir;
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true });
    }
  }

  /** Index a single file into line-sized chunks. */
  indexFile(filePath: string): IndexedChunk[] {
    if (!fs.existsSync(filePath)) return [];

    const stats = fs.statSync(filePath);
    if (stats.size > this.MAX_FILE_SIZE_MB * 1024 * 1024) return [];

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const fileChunks: IndexedChunk[] = [];

    if (this.shouldSkip(filePath, content)) return [];

    for (let i = 0; i < lines.length; i += this.CHUNK_SIZE) {
      const chunkLines = lines.slice(i, i + this.CHUNK_SIZE);
      const chunkContent = chunkLines.join('\n');
      const hash = crypto.createHash('md5').update(chunkContent).digest('hex');

      const chunk: IndexedChunk = {
        id: `${filePath}:${i}`,
        filePath,
        content: chunkContent,
        startLine: i + 1,
        endLine: Math.min(i + this.CHUNK_SIZE, lines.length),
        hash,
        indexedAt: Date.now(),
      };

      fileChunks.push(chunk);
      this.chunks.push(chunk);
    }

    this.persistFileIndex(filePath, fileChunks);
    return fileChunks;
  }

  /**
   * Index an entire directory.
   * `pattern` is a simplified glob (`**` / `*` / `?`) — not full micromatch.
   */
  indexDirectory(dirPath: string, pattern: string = '**/*.{ts,tsx,js,jsx,py,go,rs}'): number {
    let totalChunks = 0;
    const files = this.walkFiles(dirPath);

    for (const file of files) {
      if (this.matchesPattern(file, pattern)) {
        const chunks = this.indexFile(file);
        totalChunks += chunks.length;
      }
    }

    return totalChunks;
  }

  /** Search indexed content for @codebase query (substring + occurrence rank). */
  search(query: string, maxResults: number = 20): IndexedChunk[] {
    const q = query.toLowerCase();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const results = this.chunks
      .filter((chunk) => chunk.content.toLowerCase().includes(q))
      .map((chunk) => ({
        ...chunk,
        _relevance: (chunk.content.toLowerCase().match(new RegExp(escaped, 'g')) || []).length,
      }))
      .sort((a, b) => b._relevance - a._relevance)
      .slice(0, maxResults);

    return results;
  }

  /**
   * ADDON-T17: expose all indexed chunks for SemanticSearch TF-IDF ranking
   * (needs full corpus, not substring hits).
   */
  getAllChunks(): IndexedChunk[] {
    return [...this.chunks];
  }

  getStats(): { totalChunks: number; totalFiles: number; indexSize: string } {
    const uniqueFiles = new Set(this.chunks.map((c) => c.filePath));
    const size = this.chunks.reduce((sum, c) => sum + c.content.length, 0);
    const sizeStr =
      size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)}MB` : `${(size / 1024).toFixed(1)}KB`;

    return {
      totalChunks: this.chunks.length,
      totalFiles: uniqueFiles.size,
      indexSize: sizeStr,
    };
  }

  async rebuild(dirPath: string): Promise<number> {
    this.chunks = [];
    const count = this.indexDirectory(dirPath);
    this.persistIndex();
    return count;
  }

  loadIndex(): void {
    const indexPath = path.join(this.indexDir, 'index.json');
    if (!fs.existsSync(indexPath)) return;

    try {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as { chunks?: IndexedChunk[] };
      this.chunks = data.chunks ?? [];
    } catch {
      /* ignore corrupted index */
    }
  }

  private shouldSkip(filePath: string, content: string): boolean {
    const skipPatterns = [
      /node_modules/,
      /\.git/,
      /dist/,
      /build/,
      /out/,
      /package-lock\.json/,
      /yarn\.lock/,
      /\.min\./,
    ];

    for (const pattern of skipPatterns) {
      if (pattern.test(filePath)) return true;
    }

    const lines = content.split('\n');
    if (lines.length === 1 && content.length > 10000) return true;

    return false;
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    // Brace expansion for `{ts,tsx,...}` — v2.1 regex treated braces literally;
    // expand so default indexDirectory pattern actually matches extensions.
    const expanded = pattern.replace(/\{([^}]+)\}/g, (_m, inner: string) => {
      const alts = inner.split(',').map((s) => s.trim());
      return `(${alts.join('|')})`;
    });
    const regex = new RegExp(
      expanded.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.'),
      'i'
    );
    return regex.test(filePath);
  }

  private walkFiles(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...this.walkFiles(fullPath));
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private persistFileIndex(filePath: string, chunks: IndexedChunk[]): void {
    const safeName = filePath.replace(/[^a-zA-Z0-9_\-/]/g, '_').replace(/\//g, '__');
    const indexPath = path.join(this.indexDir, `${safeName}.json`);
    fs.writeFileSync(indexPath, JSON.stringify(chunks, null, 2));
  }

  private persistIndex(): void {
    const indexPath = path.join(this.indexDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({ chunks: this.chunks }, null, 2));
  }
}
