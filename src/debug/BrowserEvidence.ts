/**
 * BrowserEvidence - Debug 증거용 스크린샷/콘솔/네트워크 (C6-T29)
 * 
 * 제한: screenshot/console/network만. Design overlay는 C7-T03.
 */
export interface BrowserEvidence {
  type: 'screenshot' | 'console' | 'network';
  timestamp: number;
  data: string;
  label: string;
}

export class BrowserEvidenceCollector {
  private evidence: BrowserEvidence[] = [];

  /**
   * Capture a screenshot (stub — Playwright integration in C7-T01)
   */
  async captureScreenshot(label: string): Promise<BrowserEvidence> {
    const evidence: BrowserEvidence = {
      type: 'screenshot',
      timestamp: Date.now(),
      data: '[screenshot data would be base64 encoded]',
      label
    };
    this.evidence.push(evidence);
    return evidence;
  }

  /**
   * Capture console logs (stub)
   */
  async captureConsole(label: string): Promise<BrowserEvidence> {
    const evidence: BrowserEvidence = {
      type: 'console',
      timestamp: Date.now(),
      data: '[console logs would be collected here]',
      label
    };
    this.evidence.push(evidence);
    return evidence;
  }

  /**
   * Capture network requests (stub)
   */
  async captureNetwork(label: string): Promise<BrowserEvidence> {
    const evidence: BrowserEvidence = {
      type: 'network',
      timestamp: Date.now(),
      data: '[network requests would be captured here]',
      label
    };
    this.evidence.push(evidence);
    return evidence;
  }

  /**
   * Get all collected evidence
   */
  getAllEvidence(): BrowserEvidence[] {
    return [...this.evidence];
  }

  /**
   * Attach evidence to timeline/analysis
   */
  formatEvidenceBlock(): string {
    if (this.evidence.length === 0) return '';

    return [
      '## Browser Evidence',
      '',
      ...this.evidence.map(e => {
        const time = new Date(e.timestamp).toISOString().slice(11, 23);
        return `- [${time}] [${e.type}] ${e.label}`;
      })
    ].join('\n');
  }

  clear(): void {
    this.evidence = [];
  }
}
