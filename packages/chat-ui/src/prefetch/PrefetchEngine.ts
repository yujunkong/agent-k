/**
 * PrefetchEngine - 메시지에서 경로/심볼/에러 스택 추출 → 선독 (C1-T14)
 * 
 * @멘션 + 에러 스택 → 관련 파일/심볼 미리 읽기
 * 결과를 ContextBlock으로 조립
 */
import { extractFileMentions, extractSymbolMentions, parseFileMentionQuery } from './MentionExtractor';
import { parseStackTrace } from './StackTraceParser';
import { ContextBlockBuilder, PrefetchResult } from './ContextBlockBuilder';
import {
  inferTaskType,
  selectContextItems,
  formatSelectedContext,
} from './taskContextStrategy';
import { collectIdeContextBag } from './ideContextInjector';
import type { Mode } from '../agent/types';
import type { IdeContextCollectorDeps } from './ideContextInjector';

export interface PrefetchConfig {
  enabled: boolean;
  maxFiles: number;
  maxChars: number;
  filePatterns?: string[];
  /** ADDON-T04/T05: inject IDE + task-type context */
  ideContextEnabled?: boolean;
}

export class PrefetchEngine {
  private config: PrefetchConfig;
  private blockBuilder: ContextBlockBuilder;
  private ideDeps?: IdeContextCollectorDeps;

  constructor(
    config?: Partial<PrefetchConfig>,
    ideDeps?: IdeContextCollectorDeps
  ) {
    this.config = {
      enabled: true,
      maxFiles: 5,
      maxChars: 50000,
      ideContextEnabled: true,
      ...config
    };
    this.blockBuilder = new ContextBlockBuilder();
    this.ideDeps = ideDeps;
  }

  async prefetch(userMessage: string, mode?: Mode): Promise<string> {
    if (!this.config.enabled) return '';

    const results: PrefetchResult[] = [];

    // 1. Extract @file mentions (optional :start-end line range)
    const fileMentions = extractFileMentions(userMessage);
    for (const fileQuery of fileMentions.slice(0, this.config.maxFiles)) {
      try {
        const { path: filePath, startLine, endLine } = parseFileMentionQuery(fileQuery);
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          let content: string;
          let summary: string;
          if (startLine != null) {
            const lines = raw.split(/\r?\n/);
            const from = Math.max(0, startLine - 1);
            const to = Math.min(lines.length, endLine ?? startLine);
            content = lines.slice(from, to).join('\n').slice(0, this.config.maxChars);
            summary = `Read file: ${filePath}:${startLine}-${to} (${content.length} chars)`;
          } else {
            content = raw.slice(0, this.config.maxChars);
            summary = `Read file: ${filePath} (${content.length} chars)`;
          }
          results.push({
            type: 'file_read',
            source: startLine != null ? `${filePath}:${startLine}-${endLine ?? startLine}` : filePath,
            content,
            summary,
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

    // 4. ADDON-T04/T05: task-type strategy + IDE bag (never throw)
    if (this.config.ideContextEnabled !== false) {
      try {
        const taskType = inferTaskType(userMessage, mode);
        const bag = await collectIdeContextBag(this.ideDeps);
        // Promote stack / failing test hints from message
        if (/FAIL|Error:|assert/i.test(userMessage) && !bag.failing_test) {
          bag.failing_test = userMessage.slice(0, 2000);
          bag.error_message = bag.error_message || bag.failing_test;
        }
        const selected = selectContextItems(taskType, bag);
        const formatted = formatSelectedContext(selected, taskType);
        if (formatted) {
          results.push({
            type: 'task_context',
            source: taskType,
            content: formatted,
            summary: `Task context (${taskType}): ${selected.map((s) => s.key).join(', ')}`,
            relevance: 0.95,
            timestamp: Date.now(),
          });
        }
      } catch {
        /* never break prefetch */
      }
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
