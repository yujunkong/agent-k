/**
 * ReproduceRecorder - 사용자 재현 액션 기록 (C6-T24)
 */
export interface ReproduceScript {
  id: string;
  hypothesisId: string;
  steps: ReproduceStep[];
  createdAt: number;
  exported: boolean;
}

interface ReproduceStep {
  order: number;
  action: string;
  timestamp: number;
  result?: string;
}

export class ReproduceRecorder {
  private scripts: ReproduceScript[] = [];

  /**
   * Start a new recording session
   */
  startRecording(hypothesisId: string): string {
    const id = `rec-${Date.now()}`;
    this.scripts.push({
      id,
      hypothesisId,
      steps: [],
      createdAt: Date.now(),
      exported: false
    });
    return id;
  }

  /**
   * Record a step
   */
  recordStep(recordingId: string, action: string, result?: string): void {
    const script = this.scripts.find(s => s.id === recordingId);
    if (script) {
      script.steps.push({
        order: script.steps.length + 1,
        action,
        timestamp: Date.now(),
        result
      });
    }
  }

  /**
   * Export as reproduction script
   */
  exportScript(recordingId: string): string {
    const script = this.scripts.find(s => s.id === recordingId);
    if (!script) return '';

    script.exported = true;

    return [
      '# Reproduce Script',
      '',
      `**Hypothesis**: ${script.hypothesisId}`,
      '',
      '## Steps',
      ...script.steps.map((s, i) =>
        `${i + 1}. ${s.action}${s.result ? `\n   → ${s.result}` : ''}`
      ),
      '',
      '---',
      `_Recorded at ${new Date(script.createdAt).toISOString()}_`
    ].join('\n');
  }

  /**
   * Get recording by ID
   */
  getRecording(id: string): ReproduceScript | undefined {
    return this.scripts.find(s => s.id === id);
  }
}
