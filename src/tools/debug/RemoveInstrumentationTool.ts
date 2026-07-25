/**
 * RemoveInstrumentationTool - DEBUG_INSTRUMENT 마커 제거 (C6-T11)
 */
import { AddInstrumentationTool } from './AddInstrumentationTool';

export class RemoveInstrumentationTool {
  /**
   * Generate removal patch for a single marker
   */
  generateRemoval(markerLine: string): string {
    // The marker and its following console.log line should be removed
    const lines = markerLine.split('\n');
    if (lines.length >= 2) {
      return lines.slice(2).join('\n');
    }
    return '';
  }

  /**
   * Count remaining DEBUG_INSTRUMENT markers in content
   */
  countRemaining(content: string): number {
    const regex = /DEBUG_INSTRUMENT:/g;
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Verify zero remaining markers
   */
  verifyClean(content: string, hypothesisId?: string): { clean: boolean; remaining: number } {
    if (hypothesisId) {
      const specificRegex = new RegExp(`DEBUG_INSTRUMENT:\\s*${hypothesisId}`, 'g');
      const matches = content.match(specificRegex);
      return {
        clean: !matches || matches.length === 0,
        remaining: matches ? matches.length : 0
      };
    }

    const remaining = this.countRemaining(content);
    return { clean: remaining === 0, remaining };
  }

  /**
   * Build cleanup report
   */
  buildCleanupReport(hypothesisId: string, filesChecked: string[], results: Array<{ file: string; remaining: number }>): string {
    const totalRemaining = results.reduce((sum, r) => sum + r.remaining, 0);
    return [
      '## 🧹 Instrumentation Cleanup',
      '',
      `**Hypothesis**: ${hypothesisId}`,
      `**Files checked**: ${filesChecked.length}`,
      `**Remaining markers**: ${totalRemaining}`,
      '',
      ...results.map(r => `- ${r.file}: ${r.remaining === 0 ? '✅ Clean' : `⚠️ ${r.remaining} marker(s) remaining`}`),
      '',
      totalRemaining === 0 ? '✅ All instrumentation markers removed.' : '⚠️ Some markers remain. Review before finalizing.'
    ].join('\n');
  }
}
