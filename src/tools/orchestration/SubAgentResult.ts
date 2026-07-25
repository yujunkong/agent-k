/**
 * SubAgentResult — 서브에이전트 결과 요약만 부모에 반환 (C7-T22)
 *
 * 원문 미전파, 컨텍스트 오염 방지, 예산 캡 적용
 */
export interface SubAgentRawResult {
  taskId: string;
  fullLog: string;
  toolCalls: number;
  tokensUsed: { input: number; output: number };
  duration: number;
  status: 'completed' | 'timeout' | 'error';
  error?: string;
}

export interface SubAgentSummary {
  taskId: string;
  summary: string;
  toolCalls: number;
  tokensUsed: { input: number; output: number };
  duration: number;
  status: string;
  truncated: boolean;
}

const MAX_SUMMARY_LENGTH = 2000; // Max chars for summary passed to parent
const MIN_SUMMARY_LENGTH = 50;   // Min chars to be meaningful

export class SubAgentResult {
  /**
   * Summarize raw result for parent context
   */
  summarize(raw: SubAgentRawResult): SubAgentSummary {
    const summary = this.generateSummary(raw);

    return {
      taskId: raw.taskId,
      summary: this.truncate(summary, MAX_SUMMARY_LENGTH),
      toolCalls: raw.toolCalls,
      tokensUsed: raw.tokensUsed,
      duration: raw.duration,
      status: raw.status,
      truncated: summary.length > MAX_SUMMARY_LENGTH
    };
  }

  /**
   * Batch summarize multiple results
   */
  summarizeBatch(rawResults: SubAgentRawResult[]): SubAgentSummary[] {
    return rawResults.map(r => this.summarize(r));
  }

  /**
   * Format summaries as a compact context block
   */
  formatContextBlock(summaries: SubAgentSummary[]): string {
    if (summaries.length === 0) return '';

    const blocks = summaries.map(s => {
      const duration = (s.duration / 1000).toFixed(1);
      return [
        `- **Task ${s.taskId}**: ${s.summary.slice(0, 150)}`,
        `  Status: ${s.status} | Duration: ${duration}s | Tools: ${s.toolCalls} | Tokens: ${s.tokensUsed.input + s.tokensUsed.output}`
      ].join('\n');
    });

    return [
      '## Sub-Agent Results',
      '',
      ...blocks,
      ''
    ].join('\n');
  }

  /**
   * Estimate the context cost of a summary
   */
  estimateContextCost(summary: SubAgentSummary): number {
    // Rough: 1 token ≈ 3 chars
    return Math.ceil(summary.summary.length / 3) + 10; // +10 for metadata
  }

  /**
   * Check if the summary is meaningful enough
   */
  isMeaningful(summary: SubAgentSummary): boolean {
    return summary.summary.length >= MIN_SUMMARY_LENGTH;
  }

  private generateSummary(raw: SubAgentRawResult): string {
    if (raw.status === 'error') {
      return `Sub-agent failed: ${raw.error ?? 'Unknown error'}`;
    }

    if (raw.status === 'timeout') {
      return 'Sub-agent timed out. Consider increasing timeout or simplifying the task.';
    }

    // Extract a meaningful summary from the raw log
    const lines = raw.fullLog.split('\n').filter(l => l.trim());
    const summaryLines = lines
      .filter(l => l.startsWith('## Summary') || l.startsWith('Result:') || l.startsWith('-'))
      .slice(0, 5);

    if (summaryLines.length > 0) {
      return summaryLines.join('\n');
    }

    // Fallback: return last meaningful line
    const lastLine = lines.filter(l => l.length > 20 && !l.startsWith('[')).pop();
    return lastLine ?? `Sub-agent completed with ${raw.toolCalls} tool calls.`;
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 30) + `\n... (truncated, ${text.length - maxLength + 30} chars omitted)`;
  }
}
