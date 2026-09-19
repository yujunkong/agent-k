/**
 * RemoveInstrumentationTool - DEBUG_INSTRUMENT 마커 텍스트 처리 (C6-T11 / RW-C6-02-R2)
 * B-2: the webview cannot touch fs/vscode — file walking/removal is host-owned.
 * This module keeps the pure content transforms only.
 */

export class RemoveInstrumentationTool {
  /**
   * Strip DEBUG_INSTRUMENT marker lines (+ following console.log / if-block line) from content
   */
  stripMarkers(content: string, hypothesisId?: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    const markerRe = hypothesisId
      ? new RegExp(`DEBUG_INSTRUMENT:\\s*${hypothesisId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      : /DEBUG_INSTRUMENT:/;

    for (let i = 0; i < lines.length; i++) {
      if (markerRe.test(lines[i])) {
        // Skip marker line and the next instrumented statement line if present
        if (i + 1 < lines.length && /console\.log\(|if \(/.test(lines[i + 1])) {
          i++;
        }
        continue;
      }
      result.push(lines[i]);
    }
    return result.join('\n');
  }

  /**
   * Count remaining DEBUG_INSTRUMENT markers in content
   */
  countRemaining(content: string, hypothesisId?: string): number {
    if (hypothesisId) {
      const specificRegex = new RegExp(`DEBUG_INSTRUMENT:\\s*${hypothesisId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      return (content.match(specificRegex) || []).length;
    }
    return (content.match(/DEBUG_INSTRUMENT:/g) || []).length;
  }

  /**
   * Verify zero remaining markers
   */
  verifyClean(content: string, hypothesisId?: string): { clean: boolean; remaining: number } {
    const remaining = this.countRemaining(content, hypothesisId);
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
