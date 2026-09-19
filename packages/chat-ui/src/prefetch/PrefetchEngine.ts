/**
 * PrefetchEngine - 메시지에서 경로/심볼/에러 스택 추출 → 선독 (C1-T14)
 * 
 * @멘션 + 에러 스택 → 관련 파일/심볼 미리 읽기
 * 결과를 ContextBlock으로 조립
 */
import { extractSymbolMentions } from './MentionExtractor';
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

    // 1. @file mentions — file reads are host-owned (B-2: no fs in webview).
    //    The host PrefetchEngine reads mentioned files; the webview only
    //    contributes symbol/task context below.
    // 2. Stack traces — file reads are host-owned (same reason as above).
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

  updateConfig(config: Partial<PrefetchConfig>): void {
    Object.assign(this.config, config);
  }
}
