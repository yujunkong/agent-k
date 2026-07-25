/**
 * RequestReproduceTool - 사용자 재현 대기 도구 (C6-T07)
 */
export interface ReproduceRequest {
  hypothesisId: string;
  steps: string[];
  timeout?: number; // ms, default 5min
}

export class RequestReproduceTool {
  private pendingRequest: ReproduceRequest | null = null;
  private resolved: boolean = false;

  /**
   * Send a reproduce request to the user
   */
  request(options: ReproduceRequest): string {
    this.pendingRequest = options;
    this.resolved = false;

    return [
      '## 🔄 Please Reproduce the Issue',
      '',
      'Follow these steps to help identify the bug:',
      '',
      ...options.steps.map((s, i) => `${i + 1}. ${s}`),
      '',
      `**Hypothesis**: ${options.hypothesisId}`,
      '',
      'Once you have completed the steps, confirm by clicking "Reproduced" or typing "reproduced".',
      `_(Timeout: ${(options.timeout || 300000) / 1000}s)_`
    ].join('\n');
  }

  /**
   * Mark the reproduction as complete
   */
  confirmReproduced(): { success: boolean; request: ReproduceRequest | null } {
    if (!this.pendingRequest) {
      return { success: false, request: null };
    }
    this.resolved = true;
    const req = this.pendingRequest;
    this.pendingRequest = null;
    return { success: true, request: req };
  }

  /**
   * Check if a reproduction is pending
   */
  isPending(): boolean {
    return this.pendingRequest !== null && !this.resolved;
  }

  /**
   * Cancel pending reproduction
   */
  cancel(): void {
    this.pendingRequest = null;
    this.resolved = false;
  }

  /**
   * Get the pending request
   */
  getPending(): ReproduceRequest | null {
    return this.pendingRequest;
  }

  /**
   * Build reproduce guide for UI
   */
  buildGuide(request: ReproduceRequest): string {
    return [
      '## Debug Reproduction Guide',
      '',
      `**Investigating**: ${request.hypothesisId}`,
      '',
      '### Steps',
      ...request.steps.map((s, i) => `${i + 1}. ${s}`),
      '',
      'After completing the steps, click "Reproduced" to continue.'
    ].join('\n');
  }
}
