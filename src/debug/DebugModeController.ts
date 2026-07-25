/**
 * DebugModeController - 6단계 Debug FSM (C6-T01)
 * 
 * 가설(Hypothesis) → 계측(Instrument) → 재현(Reproduce) → 로그(Analyze) → 최소수정(Fix) → 청소(Cleanup)
 *
 * RW-C6-03-R2: BrowserEvidence 타임라인 배선
 * RW-C6-06-R2: remainingMarkers는 워크스페이스 실스캔 (더미 -1 금지)
 */
import { BrowserEvidenceCollector, type BrowserEvidence } from './BrowserEvidence';
import { VerifyCleanup } from './VerifyCleanup';

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
  /** Cached remaining marker count from last workspace scan (-1 only before first scan) */
  remainingMarkers: number;
  browserEvidenceCount: number;
}

export class DebugModeController {
  private state: DebugState;
  private onStageChange: ((stage: DebugStage) => void) | null = null;
  // RW-C6-03-R2: evidence collector attached to debug session timeline
  private evidenceCollector = new BrowserEvidenceCollector();
  private verifyCleanup = new VerifyCleanup();
  private lastScanAt = 0;

  constructor() {
    this.state = {
      stage: 'hypothesis',
      hypotheses: [],
      activeHypothesisId: null,
      logs: [],
      fixApplied: false,
      markersRemoved: false,
      verified: false,
      remainingMarkers: 0,
      browserEvidenceCount: 0
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

  /** Stage 6: Cleanup — prefer real scan count when provided */
  markCleanupDone(markersRemaining?: number): void {
    if (markersRemaining !== undefined) {
      this.state.remainingMarkers = markersRemaining;
      this.state.markersRemoved = markersRemaining === 0;
    } else {
      this.state.markersRemoved = this.state.remainingMarkers === 0;
    }
    this.state.verified = this.state.markersRemoved;
    if (this.state.markersRemoved) {
      this.setStage('hypothesis');
    }
  }

  /**
   * RW-C6-06-R2: Scan workspace for DEBUG_INSTRUMENT — never return -1 dummy
   */
  async refreshRemainingMarkers(root?: string): Promise<number> {
    const hypId = this.state.activeHypothesisId || undefined;
    const scan = await this.verifyCleanup.scanWorkspace(hypId);
    this.state.remainingMarkers = scan.remaining;
    this.state.markersRemoved = scan.remaining === 0;
    this.lastScanAt = Date.now();
    return scan.remaining;
  }

  /** Cached count from last scan (0 before any instrumentation / after clean) */
  get remainingMarkers(): number {
    return this.state.remainingMarkers;
  }

  /**
   * RW-C6-03-R2: Capture browser evidence and attach to debug timeline/logs
   */
  async captureEvidence(
    type: 'screenshot' | 'console' | 'network',
    label: string,
    sessionId?: string
  ): Promise<BrowserEvidence> {
    let evidence: BrowserEvidence;
    if (type === 'screenshot') {
      evidence = await this.evidenceCollector.captureScreenshot(label, sessionId);
    } else if (type === 'console') {
      evidence = await this.evidenceCollector.captureConsole(label, sessionId);
    } else {
      evidence = await this.evidenceCollector.captureNetwork(label, sessionId);
    }
    this.state.browserEvidenceCount = this.evidenceCollector.getAllEvidence().length;
    // Attach to analysis logs / timeline
    this.state.logs.push(`[evidence:${type}] ${label} @ ${new Date(evidence.timestamp).toISOString()}`);
    const active = this.getActiveHypothesis();
    if (active) {
      active.evidence.push(`${type}:${label}`);
    }
    return evidence;
  }

  attachBrowserSessionManager(sessionManager: unknown): void {
    this.evidenceCollector.attachSessionManager(sessionManager);
  }

  getBrowserEvidence(): BrowserEvidence[] {
    return this.evidenceCollector.getAllEvidence();
  }

  getEvidenceBlock(): string {
    return this.evidenceCollector.formatEvidenceBlock();
  }

  reset(): void {
    this.evidenceCollector.clear();
    this.state = {
      stage: 'hypothesis',
      hypotheses: [],
      activeHypothesisId: null,
      logs: [],
      fixApplied: false,
      markersRemoved: false,
      verified: false,
      remainingMarkers: 0,
      browserEvidenceCount: 0
    };
    this.lastScanAt = 0;
  }

  /** Build debug context block for system prompt (includes browser evidence) */
  buildContextBlock(): string {
    const active = this.getActiveHypothesis();
    const evidenceBlock = this.evidenceCollector.formatEvidenceBlock();
    const lines: string[] = [
      '## Debug Session State',
      `**Stage**: ${this.state.stage}`,
      `**Hypotheses**: ${this.state.hypotheses.length}`,
      `**Remaining markers**: ${this.state.remainingMarkers}`,
      `**Browser evidence**: ${this.state.browserEvidenceCount}`,
      ...(active ? [`**Active**: ${active.title} (${active.status})`] : []),
      '',
      '### Hypotheses',
      ...this.state.hypotheses.map(h =>
        `- [${h.status === 'confirmed' ? 'x' : ' '}] **${h.title}** (${h.status})`
      ),
      ...(this.state.logs.length > 0 ? ['', '### Logs', ...this.state.logs.slice(-10)] : []),
      ...(evidenceBlock ? ['', evidenceBlock] : [])
    ];
    return lines.join('\n');
  }
}
