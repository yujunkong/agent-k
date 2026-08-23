/**
 * TOOL-012 companion — summarize subagent results for the parent transcript.
 * Ported from v2.1 SubAgentResult (no child log leak).
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

const MAX_SUMMARY_LENGTH = 2000;
const MIN_SUMMARY_LENGTH = 50;

export class SubAgentResult {
  summarize(raw: SubAgentRawResult): SubAgentSummary {
    const summary = this.generateSummary(raw);
    return {
      taskId: raw.taskId,
      summary: this.truncate(summary, MAX_SUMMARY_LENGTH),
      toolCalls: raw.toolCalls,
      tokensUsed: raw.tokensUsed,
      duration: raw.duration,
      status: raw.status,
      truncated: summary.length > MAX_SUMMARY_LENGTH,
    };
  }

  summarizeBatch(rawResults: SubAgentRawResult[]): SubAgentSummary[] {
    return rawResults.map((r) => this.summarize(r));
  }

  formatContextBlock(summaries: SubAgentSummary[]): string {
    if (summaries.length === 0) return '';
    const blocks = summaries.map((s) => {
      const duration = (s.duration / 1000).toFixed(1);
      return [
        `- **Task ${s.taskId}**: ${s.summary.slice(0, 150)}`,
        `  Status: ${s.status} | Duration: ${duration}s | Tools: ${s.toolCalls} | Tokens: ${s.tokensUsed.input + s.tokensUsed.output}`,
      ].join('\n');
    });
    return ['## Sub-Agent Results', '', ...blocks, ''].join('\n');
  }

  estimateContextCost(summary: SubAgentSummary): number {
    return Math.ceil(summary.summary.length / 3) + 10;
  }

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
    const lines = raw.fullLog.split('\n').filter((l) => l.trim());
    const summaryLines = lines
      .filter(
        (l) =>
          l.startsWith('## Summary') ||
          l.startsWith('Result:') ||
          l.startsWith('-')
      )
      .slice(0, 5);
    if (summaryLines.length > 0) return summaryLines.join('\n');
    const lastLine = lines
      .filter((l) => l.length > 20 && !l.startsWith('['))
      .pop();
    return (
      lastLine ?? `Sub-agent completed with ${raw.toolCalls} tool calls.`
    );
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return (
      text.slice(0, maxLength - 30) +
      `\n... (truncated, ${text.length - maxLength + 30} chars omitted)`
    );
  }
}
