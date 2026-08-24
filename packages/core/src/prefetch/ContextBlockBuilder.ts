/**
 * CTX-011 — ContextBlockBuilder ported from v2.1 `src/prefetch/ContextBlockBuilder.ts`.
 * Turns PrefetchResult[] into a system-prompt-injectable block (C1-T17).
 */

export interface PrefetchResult {
  type: 'file_read' | 'grep_result' | 'stack_frame' | 'symbol_info' | 'task_context' | 'ide_context';
  source: string;
  content: string;
  summary: string;
  relevance: number; // 0-1
  timestamp: number;
}

export class ContextBlockBuilder {
  private readonly maxBlockTokens = 4000; // ~3% of 128k

  buildBlock(results: PrefetchResult[]): string {
    if (results.length === 0) return '';

    const sorted = [...results].sort((a, b) => b.relevance - a.relevance);

    const lines: string[] = [];
    lines.push('<prefetched_context>');
    lines.push('The following information has been pre-fetched to provide context:');
    lines.push('');

    let estimatedTokens = 0;

    for (const result of sorted) {
      const entry = this.formatEntry(result);
      const entryTokens = Math.ceil(entry.length / 4);

      if (estimatedTokens + entryTokens > this.maxBlockTokens) {
        lines.push('');
        lines.push(`... and ${sorted.length - sorted.indexOf(result)} more items (truncated for budget)`);
        break;
      }

      lines.push(entry);
      estimatedTokens += entryTokens;

      if (result.content.length < 2000) {
        lines.push(result.content);
        lines.push('');
      } else {
        lines.push(result.content.slice(0, 2000) + '\n...(truncated)');
        lines.push('');
      }
    }

    lines.push('</prefetched_context>');

    return lines.join('\n');
  }

  private formatEntry(result: PrefetchResult): string {
    const typeLabel: Record<string, string> = {
      file_read: '📄 File',
      grep_result: '🔍 Search',
      stack_frame: '⚠️ Stack Frame',
      symbol_info: '🔣 Symbol',
      task_context: '🎯 Task Context',
      ide_context: '💻 IDE',
    };

    return `[${typeLabel[result.type] || '📎'} ${result.source}] ${result.summary}`;
  }
}
