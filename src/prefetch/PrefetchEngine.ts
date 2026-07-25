/**
 * PrefetchEngine - 메시지에서 경로/심볼/에러 스택 추출 → 선독 (C1-T14)
 * 
 * @멘션 + 에러 스택 → 관련 파일/심볼 미리 읽기
 * 결과를 ContextBlock으로 조립
 */
import { extractFileMentions, extractSymbolMentions, hasCodebaseMention } from './MentionExtractor';
import { parseStackTrace, getContextFiles } from './StackTraceParser';
import { ContextBlockBuilder, PrefetchResult } from './ContextBlockBuilder';

export interface PrefetchConfig {
  enabled: boolean;
  maxFiles: number;
  maxChars: number;
  filePatterns?: string[];
}

export class PrefetchEngine {
  private config: PrefetchConfig;
  private blockBuilder: ContextBlockBuilder;

  constructor(config?: Partial<PrefetchConfig>) {
    this.config = {
      enabled: true,
      maxFiles: 5,
      maxChars: 50000,
      ...config
    };
    this.blockBuilder = new ContextBlockBuilder();
  }

  async prefetch(userMessage: string): Promise<string> {
    if (!this.config.enabled) return '';

    const results: PrefetchResult[] = [];

    // 1. Extract @file mentions
    const fileMentions = extractFileMentions(userMessage);
    for (const filePath of fileMentions.slice(0, this.config.maxFiles)) {
      try {
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8').slice(0, this.config.maxChars);
          results.push({
            type: 'file_read',
            source: filePath,
            content,
            summary: `Read file: ${filePath} (${content.length} chars)`,
            relevance: 0.9,
            timestamp: Date.now()
          });
        }
      } catch { /* file not found */ }
    }

    // 2. Extract stack traces
    const stackFrames = parseStackTrace(userMessage);
    for (const frame of stackFrames.slice(0, this.config.maxFiles)) {
      try {
        const fs = require('fs');
        if (fs.existsSync(frame.file)) {
          const lines: string[] = [];
          const content = fs.readFileSync(frame.file, 'utf-8').split('\n');
          const start = Math.max(0, frame.line - 5);
          const end = Math.min(content.length, frame.line + 5);
          for (let i = start; i < end; i++) {
            lines.push(`${i + 1}: ${content[i]}`);
          }
          results.push({
            type: 'stack_frame',
            source: `${frame.file}:${frame.line}`,
            content: lines.join('\n'),
            summary: `Stack frame context: ${frame.file}:${frame.line}`,
            relevance: 0.8,
            timestamp: Date.now()
          });
        }
      } catch { /* ignore */ }
    }

    // 3. Extract @symbol mentions
    const symbols = extractSymbolMentions(userMessage);
    for (const symbol of symbols.slice(0, 3)) {
      results.push({
        type: 'symbol_info',
        source: symbol,
        content: `Symbol: ${symbol}`,
        summary: `Symbol mentioned: ${symbol}`,
        relevance: 0.6,
        timestamp: Date.now()
      });
    }

    // Build context block
    return this.blockBuilder.buildBlock(results);
  }

  async prefetchWithPaths(paths: string[]): Promise<string> {
    const results: PrefetchResult[] = [];

    for (const filePath of paths.slice(0, this.config.maxFiles)) {
      try {
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8').slice(0, this.config.maxChars);
          results.push({
            type: 'file_read',
            source: filePath,
            content,
            summary: `Pre-fetched: ${filePath}`,
            relevance: 0.9,
            timestamp: Date.now()
          });
        }
      } catch { /* ignore */ }
    }

    return this.blockBuilder.buildBlock(results);
  }

  updateConfig(config: Partial<PrefetchConfig>): void {
    Object.assign(this.config, config);
  }
}
