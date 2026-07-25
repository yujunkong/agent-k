/**
 * DebugModeController - 6단계 Debug FSM (C6-T01)
 * 
 * 가설(Hypothesis) → 계측(Instrument) → 재현(Reproduce) → 로그(Analyze) → 최소수정(Fix) → 청소(Cleanup)
 */
export type DebugStage = 'hypothesis' | 'instrument' | 'reproduce' | 'analyze' | 'fix' | 'cleanup';
export type HypothesisStatus = 'pending' | 'investigating' | 'confirmed' | 'rejected';

export interface Hypothesis {
  id: string;
  title: string;
  description: string;
  status: HypothesisStatus;
  evidence: string[];
  files: string[];
  createdAt: number;
}

export interface DebugState {
  stage: DebugStage;
  hypotheses: Hypothesis[];
  activeHypothesisId: string | null;
  logs: string[];
  fixApplied: boolean;
  markersRemoved: boolean;
  verified: boolean;
}

export class DebugModeController {
  private state: DebugState;
  private onStageChange: ((stage: DebugStage) => void) | null = null;

  constructor() {
    this.state = {
      stage: 'hypothesis',
      hypotheses: [],
      activeHypothesisId: null,
      logs: [],
      fixApplied: false,
      markersRemoved: false,
      verified: false
    };
  }

  getStage(): DebugStage { return this.state.stage; }
  getState(): DebugState { return { ...this.state }; }

  onStageChangeCallback(cb: (stage: DebugStage) => void): void {
    this.onStageChange = cb;
  }

  private setStage(stage: DebugStage): void {
    this.state.stage = stage;
    this.onStageChange?.(stage);
  }

  /** Stage 1: Generate hypotheses */
  addHypothesis(title: string, description: string, files: string[]): Hypothesis {
    const h: Hypothesis = {
      id: `hyp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      description,
      status: 'pending',
      evidence: [],
      files,
      createdAt: Date.now()
    };
    this.state.hypotheses.push(h);
    return h;
  }

  selectHypothesis(id: string): void {
    const h = this.state.hypotheses.find(h => h.id === id);
    if (!h) throw new Error(`Hypothesis ${id} not found`);
    
    // Reset previous active hypothesis
    this.state.hypotheses.forEach(h => {
      if (h.status === 'investigating') h.status = 'pending';
    });
    
    h.status = 'investigating';
    this.state.activeHypothesisId = id;
    this.setStage('instrument');
  }

  getHypotheses(): Hypothesis[] { return [...this.state.hypotheses]; }
  getActiveHypothesis(): Hypothesis | null {
    if (!this.state.activeHypothesisId) return null;
    return this.state.hypotheses.find(h => h.id === this.state.activeHypothesisId) || null;
  }

  /** Stage 2: Instrumentation */
  markInstrumented(): void {
    if (this.state.stage !== 'instrument') return;
    this.setStage('reproduce');
  }

  /** Stage 3: Reproduce */
  markReproduced(): void {
    this.setStage('analyze');
  }

  /** Stage 4: Analysis */
  addLog(log: string): void { this.state.logs.push(log); }

  confirmHypothesis(id: string, evidence: string[]): void {
    const h = this.state.hypotheses.find(h => h.id === id);
    if (h) {
      h.status = 'confirmed';
      h.evidence.push(...evidence);
    }
  }

  rejectHypothesis(id: string, reason: string): void {
    const h = this.state.hypotheses.find(h => h.id === id);
    if (h) {
      h.status = 'rejected';
      h.evidence.push(reason);
      this.state.activeHypothesisId = null;
    }
  }

  moveToFix(): void {
    if (this.state.hypotheses.some(h => h.status === 'confirmed')) {
      this.setStage('fix');
    }
  }

  /** Stage 5: Fix */
  markFixApplied(): void {
    this.state.fixApplied = true;
    this.setStage('cleanup');
  }

  /** Stage 6: Cleanup */
  markCleanupDone(): void {
    this.state.markersRemoved = true;
    this.state.verified = true;
    this.setStage('hypothesis'); // Reset for next debug session
  }

  /** Check if all markers are removed */
  get remainingMarkers(): number {
    return this.state.markersRemoved ? 0 : -1; // unknown until verified
  }

  reset(): void {
    this.state = {
      stage: 'hypothesis',
      hypotheses: [],
      activeHypothesisId: null,
      logs: [],
      fixApplied: false,
      markersRemoved: false,
      verified: false
    };
  }

  /** Build debug context block for system prompt */
  buildContextBlock(): string {
    const active = this.getActiveHypothesis();
    const lines: string[] = [
      '## Debug Session State',
      `**Stage**: ${this.state.stage}`,
      `**Hypotheses**: ${this.state.hypotheses.length}`,
      ...(active ? [`**Active**: ${active.title} (${active.status})`] : []),
      '',
      '### Hypotheses',
      ...this.state.hypotheses.map(h => 
        `- [${h.status === 'confirmed' ? 'x' : ' '}] **${h.title}** (${h.status})`
      ),
      ...(this.state.logs.length > 0 ? ['', '### Logs', ...this.state.logs.slice(-10)] : [])
    ];
    return lines.join('\n');
  }
}
