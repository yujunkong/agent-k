/**
 * ParallelSearch — 병렬 파일 검색/읽기 (C7-T29)
 *
 * findFiles + Promise.all + p-limit concurrency 큐 + 취소 지원
 */
import * as vscode from 'vscode';
import * as fs from 'fs';

export interface ParallelSearchOptions {
  patterns: string[];
  maxResults?: number;
  concurrency?: number;
  signal?: AbortSignal;
}

export interface SearchResult {
  pattern: string;
  files: vscode.Uri[];
  error?: string;
}

export interface ReadOptions {
  filePaths: string[];
  maxLines?: number;
  concurrency?: number;
}

export interface ReadResult {
  filePath: string;
  content: string;
  truncated: boolean;
  error?: string;
}

export class ParallelSearch {
  private readonly MAX_CONCURRENCY = 16;

  /**
   * Search files with multiple patterns in parallel
   */
  async search(options: ParallelSearchOptions): Promise<SearchResult[]> {
    const concurrency = Math.min(options.concurrency ?? this.MAX_CONCURRENCY, this.MAX_CONCURRENCY);
    const maxResults = options.maxResults ?? 200;

    // Process in batches based on concurrency
    const results: SearchResult[] = [];
    const batches = this.chunkArray(options.patterns, concurrency);

    for (const batch of batches) {
      if (options.signal?.aborted) break;

      const batchResults = await Promise.all(
        batch.map(async (pattern): Promise<SearchResult> => {
          try {
            if (options.signal?.aborted) return { pattern, files: [] };

            const files = await vscode.workspace.findFiles(pattern, undefined, maxResults);
            return { pattern, files };
          } catch (err) {
            return { pattern, files: [], error: String(err) };
          }
        })
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Read multiple files in parallel with concurrency limit
   */
  async readFiles(options: ReadOptions): Promise<ReadResult[]> {
    const concurrency = Math.min(options.concurrency ?? this.MAX_CONCURRENCY, this.MAX_CONCURRENCY);
    const maxLines = options.maxLines ?? 250;

    const results: ReadResult[] = [];
    const batches = this.chunkArray(options.filePaths, concurrency);

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async (filePath): Promise<ReadResult> => {
          try {
            if (!fs.existsSync(filePath)) {
              return { filePath, content: '', truncated: false, error: 'File not found' };
            }

            const fullContent = fs.readFileSync(filePath, 'utf-8');
            const lines = fullContent.split('\n');

            if (lines.length <= maxLines) {
              return { filePath, content: fullContent, truncated: false };
            }

            return {
              filePath,
              content: lines.slice(0, maxLines).join('\n') + `\n... (truncated, ${lines.length - maxLines} more lines)`,
              truncated: true
            };
          } catch (err) {
            return { filePath, content: '', truncated: false, error: String(err) };
          }
        })
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Cancel in-flight operations via AbortController
   */
  createCancelToken(): { signal: AbortSignal; cancel: () => void } {
    const controller = new AbortController();
    return {
      signal: controller.signal,
      cancel: () => controller.abort()
    };
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
