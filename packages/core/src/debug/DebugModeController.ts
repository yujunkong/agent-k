/**
 * DEBUG-001…010 — Debug domain FSM + helpers (no UI).
 */

export type DebugStage =
  | 'hypothesis'
  | 'instrument'
  | 'reproduce'
  | 'analyze'
  | 'fix'
  | 'cleanup';

export type HypothesisStatus =
  | 'pending'
  | 'investigating'
  | 'confirmed'
  | 'rejected';

export interface Hypothesis {
  id: string;
  title: string;
  description: string;
  status: HypothesisStatus;
  evidence: string[];
  files: string[];
  createdAt: number;
}

export interface DebugEvidenceItem {
  id: string;
  kind: 'log' | 'screenshot' | 'stack' | 'note' | 'browser';
  summary: string;
  detail?: string;
  at: number;
}

export interface DebugTimelineEntry {
  id: string;
  stage: DebugStage;
  label: string;
  at: number;
  meta?: Record<string, unknown>;
}

export interface DebugState {
  stage: DebugStage;
  hypotheses: Hypothesis[];
  activeHypothesisId: string | null;
  logs: string[];
  evidence: DebugEvidenceItem[];
  timeline: DebugTimelineEntry[];
  fixApplied: boolean;
  markersRemoved: boolean;
  remainingMarkers: number;
}

const STAGE_ORDER: DebugStage[] = [
  'hypothesis',
  'instrument',
  'reproduce',
  'analyze',
  'fix',
  'cleanup',
];

/** DEBUG-001 stage prompts (domain only). */
export const DEBUG_STAGE_PROMPTS: Record<DebugStage, string> = {
  hypothesis:
    'DEBUG/hypothesis: Form 2–3 root-cause hypotheses. Read-only. Ask which to test.',
  instrument:
    'DEBUG/instrument: Add instrumentation markers only — do not apply the real fix yet.',
  reproduce:
    'DEBUG/reproduce: Give clear reproduce steps and wait for the user.',
  analyze:
    'DEBUG/analyze: Collect logs, confirm or reject the active hypothesis. Wait for Confirm & Fix.',
  fix: 'DEBUG/fix: Apply the minimal fix for the confirmed hypothesis. Keep markers until cleanup.',
  cleanup:
    'DEBUG/cleanup: Remove all instrumentation markers and verify none remain.',
};

/** DEBUG-009 — Instrumentation marker templates. */
export const INSTRUMENTATION_TEMPLATES = {
  jsLog: (label: string) =>
    `/* DEBUG_INSTRUMENT:${label} */ console.log('[DEBUG_INSTRUMENT:${label}]', { t: Date.now() });`,
  tsLog: (label: string) =>
    `// DEBUG_INSTRUMENT:${label}\nconsole.log('[DEBUG_INSTRUMENT:${label}]', { t: Date.now() });`,
  pythonLog: (label: string) =>
    `# DEBUG_INSTRUMENT:${label}\nprint(f"[DEBUG_INSTRUMENT:{label}]")`,
} as const;

const DEBUG_READ = [
  'grep',
  'glob',
  'file_search',
  'list_dir',
  'read_file',
  'codebase_search',
  'ask_question',
  'todo_write',
];

export const DEBUG_STAGE_TOOLS: Record<DebugStage, string[]> = {
  hypothesis: [...DEBUG_READ],
  instrument: [...DEBUG_READ, 'debug_add_instrumentation'],
  reproduce: [...DEBUG_READ, 'debug_add_instrumentation'],
  analyze: [...DEBUG_READ, 'debug_collect_logs', 'run_terminal_cmd'],
  fix: [
    ...DEBUG_READ,
    'edit_file',
    'write_file',
    'run_terminal_cmd',
    'debug_remove_instrumentation',
  ],
  cleanup: [...DEBUG_READ, 'debug_remove_instrumentation', 'run_terminal_cmd'],
};

export function isDebugToolAllowedForStage(
  stage: DebugStage,
  toolName: string
): boolean {
  const allowed = DEBUG_STAGE_TOOLS[stage];
  if (!allowed) return false;
  if (toolName.startsWith('mcp_')) {
    return stage === 'analyze' || stage === 'fix' || stage === 'hypothesis';
  }
  return allowed.includes(toolName);
}

let _seq = 0;
function nextId(prefix: string): string {
  _seq += 1;
  return `${prefix}_${Date.now()}_${_seq}`;
}

function emptyDebugState(): DebugState {
  return {
    stage: 'hypothesis',
    hypotheses: [],
    activeHypothesisId: null,
    logs: [],
    evidence: [],
    timeline: [],
    fixApplied: false,
    markersRemoved: false,
    remainingMarkers: 0,
  };
}

/** DEBUG-001 — Session lifecycle controller (hypothesis→…→cleanup). */
export class DebugModeController {
  private state: DebugState = emptyDebugState();
  private onStageChange: ((stage: DebugStage) => void) | null = null;

  getStage(): DebugStage {
    return this.state.stage;
  }

  getState(): DebugState {
    return {
      ...this.state,
      hypotheses: this.state.hypotheses.map((h) => ({
        ...h,
        evidence: [...h.evidence],
        files: [...h.files],
      })),
      logs: [...this.state.logs],
      evidence: [...this.state.evidence],
      timeline: [...this.state.timeline],
    };
  }

  onStageChangeCallback(cb: (stage: DebugStage) => void): void {
    this.onStageChange = cb;
  }

  private setStage(stage: DebugStage): void {
    this.state.stage = stage;
    this.pushTimeline(stage, `Entered ${stage}`);
    this.onStageChange?.(stage);
  }

  syncStageFromHost(stage: DebugStage): void {
    if (!STAGE_ORDER.includes(stage)) return;
    this.setStage(stage);
  }

  private pushTimeline(
    stage: DebugStage,
    label: string,
    meta?: Record<string, unknown>
  ): void {
    this.state.timeline.push({
      id: nextId('tl'),
      stage,
      label,
      at: Date.now(),
      meta,
    });
  }

  goToStage(stage: DebugStage): { ok: boolean; error?: string } {
    if (!STAGE_ORDER.includes(stage)) {
      return { ok: false, error: `Unknown stage: ${stage}` };
    }
    const currentIdx = STAGE_ORDER.indexOf(this.state.stage);
    const targetIdx = STAGE_ORDER.indexOf(stage);

    if (targetIdx <= currentIdx) {
      this.setStage(stage);
      return { ok: true };
    }
    if (targetIdx > currentIdx + 1) {
      return { ok: false, error: 'Complete the previous stage first.' };
    }
    if (stage === 'instrument' && !this.state.activeHypothesisId) {
      return {
        ok: false,
        error: 'Select a hypothesis first, then move to Instrument.',
      };
    }
    if (stage === 'fix') {
      const confirmed = this.state.hypotheses.some((h) => h.status === 'confirmed');
      if (!confirmed) {
        return {
          ok: false,
          error: 'A confirmed hypothesis is required before Fix.',
        };
      }
    }
    if (stage === 'cleanup' && !this.state.fixApplied) {
      return { ok: false, error: 'Apply a Fix first, then move to Cleanup.' };
    }

    this.setStage(stage);
    return { ok: true };
  }

  /** DEBUG-002 */
  addHypothesis(
    title: string,
    description: string,
    files: string[] = []
  ): Hypothesis {
    const h: Hypothesis = {
      id: nextId('hyp'),
      title,
      description,
      status: 'pending',
      evidence: [],
      files: [...files],
      createdAt: Date.now(),
    };
    this.state.hypotheses.push(h);
    this.pushTimeline('hypothesis', `Hypothesis: ${title}`, { id: h.id });
    return h;
  }

  selectHypothesis(id: string): boolean {
    const h = this.state.hypotheses.find((x) => x.id === id);
    if (!h) return false;
    this.state.activeHypothesisId = id;
    h.status = 'investigating';
    return true;
  }

  setHypothesisStatus(id: string, status: HypothesisStatus): boolean {
    const h = this.state.hypotheses.find((x) => x.id === id);
    if (!h) return false;
    h.status = status;
    return true;
  }

  /** DEBUG-003 */
  recordReproduceSteps(steps: string): void {
    this.state.logs.push(`[reproduce]\n${steps}`);
    this.pushTimeline('reproduce', 'Reproduce steps recorded');
  }

  /** DEBUG-004 */
  analyzeLogs(raw: string): { matches: string[]; summary: string } {
    this.state.logs.push(raw);
    const lines = raw.split('\n');
    const matches = lines.filter((l) =>
      /error|exception|fail|DEBUG_INSTRUMENT|traceback/i.test(l)
    );
    const summary =
      matches.length === 0
        ? 'No error-like lines found in logs.'
        : `Found ${matches.length} error-like line(s); top: ${matches[0]!.slice(0, 120)}`;
    this.pushTimeline('analyze', summary, { matchCount: matches.length });
    return { matches, summary };
  }

  /** DEBUG-005 */
  markFixApplied(note: string): void {
    this.state.fixApplied = true;
    this.pushTimeline('fix', note || 'Fix applied');
  }

  /** DEBUG-006 */
  markCleanup(remainingMarkers: number): void {
    this.state.markersRemoved = remainingMarkers === 0;
    this.state.remainingMarkers = remainingMarkers;
    this.pushTimeline(
      'cleanup',
      `Cleanup done; remaining markers=${remainingMarkers}`
    );
  }

  /** DEBUG-008 */
  addEvidence(
    item: Omit<DebugEvidenceItem, 'id' | 'at'>
  ): DebugEvidenceItem {
    const ev: DebugEvidenceItem = {
      ...item,
      id: nextId('ev'),
      at: Date.now(),
    };
    this.state.evidence.push(ev);
    this.pushTimeline(this.state.stage, `Evidence: ${ev.summary}`, {
      evidenceId: ev.id,
    });
    return ev;
  }

  getTimeline(): DebugTimelineEntry[] {
    return [...this.state.timeline];
  }

  stagePrompt(): string {
    return DEBUG_STAGE_PROMPTS[this.state.stage];
  }

  reset(): void {
    this.state = emptyDebugState();
  }
}

/** DEBUG-010 — Multi-file debug session template. */
export interface MultiFileDebugTemplate {
  id: string;
  title: string;
  files: string[];
  hypothesisSeed: string;
  instrumentHints: string[];
}

export const MULTI_FILE_DEBUG_TEMPLATES: MultiFileDebugTemplate[] = [
  {
    id: 'api-handler',
    title: 'API handler path',
    files: ['src/**/routes/**', 'src/**/handlers/**', 'src/**/controllers/**'],
    hypothesisSeed:
      'Request never reaches the expected handler / wrong route match',
    instrumentHints: [
      'entry middleware',
      'handler entry',
      'response serialization',
    ],
  },
  {
    id: 'state-race',
    title: 'Shared state race',
    files: ['src/**/store/**', 'src/**/state/**', 'src/**/cache/**'],
    hypothesisSeed: 'Stale or racing shared state between async writers',
    instrumentHints: ['before write', 'after write', 'read path'],
  },
];

export function pickMultiFileTemplate(
  id: string
): MultiFileDebugTemplate | undefined {
  return MULTI_FILE_DEBUG_TEMPLATES.find((t) => t.id === id);
}

/** Count DEBUG_INSTRUMENT markers (cleanup verification helper). */
export function countInstrumentationMarkers(source: string): number {
  return (source.match(/DEBUG_INSTRUMENT/g) || []).length;
}
