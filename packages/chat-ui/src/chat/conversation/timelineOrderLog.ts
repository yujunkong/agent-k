/**
 * CONV-013 order diagnostics — Webview DevTools filter: `agent-k:[timeline-order]`
 * Logs only when the fingerprint of ids/status/phase layout changes (not every paint).
 */
import { debugLog, debugWarn } from '../debugLog';

const lastFp = new Map<string, string>();

function emit(channel: string, fingerprint: string, payload: unknown): void {
  const prev = lastFp.get(channel);
  if (prev === fingerprint) return;
  lastFp.set(channel, fingerprint);
  debugLog('timeline-order', channel, payload);
}

export type TimelineOrderStepSnap = {
  id: string;
  kind?: string;
  tool?: string;
  status?: string;
  turn?: number;
  thoughtRole?: string;
};

export function logTimelineInputOrder(input: {
  source: 'steps' | 'workItems-mapped' | 'mixed';
  streaming: boolean;
  ownerId?: string;
  steps: TimelineOrderStepSnap[];
  workItemIds?: string[];
  fileEditIds?: string[];
  terminalIds?: string[];
  turnProse?: Array<{ id: string; turn: number; len: number }>;
}): void {
  const fp = JSON.stringify({
    owner: input.ownerId,
    source: input.source,
    streaming: input.streaming,
    steps: input.steps,
    work: input.workItemIds,
    fe: input.fileEditIds,
    tr: input.terminalIds,
    prose: input.turnProse
  });
  emit('input', fp, {
    ownerId: input.ownerId,
    source: input.source,
    streaming: input.streaming,
    stepOrder: input.steps.map(
      (s, i) =>
        `${i}:${s.id}|${s.kind || '?'}|${s.tool || '-'}|${s.status || '?'}|t${s.turn ?? '?'}${s.thoughtRole ? `|${s.thoughtRole}` : ''}`
    ),
    workItemIds: input.workItemIds,
    fileEditIds: input.fileEditIds,
    terminalIds: input.terminalIds,
    turnProse: input.turnProse
  });

  // Detect non-monotonic turn numbers in step list (common reorder smell).
  let prevTurn = -1;
  for (const s of input.steps) {
    const t = typeof s.turn === 'number' ? s.turn : prevTurn;
    if (typeof s.turn === 'number' && s.turn < prevTurn) {
      debugWarn('timeline-order', 'non-monotonic turn in steps', {
        stepId: s.id,
        turn: s.turn,
        prevTurn
      });
      break;
    }
    if (typeof s.turn === 'number') prevTurn = t;
  }
}

export type TimelinePhaseSnap = {
  id: string;
  thought?: string;
  explore: string[];
  actions: string[];
  resolved: boolean;
  editIds: string[];
  termIds: string[];
};

export function logTimelinePhaseOrder(input: {
  streaming: boolean;
  ownerId?: string;
  phases: TimelinePhaseSnap[];
}): void {
  const fp = JSON.stringify(input);
  emit('phases', fp, {
    ownerId: input.ownerId,
    streaming: input.streaming,
    phaseCount: input.phases.length,
    phases: input.phases.map((p, i) => ({
      i,
      id: p.id,
      resolved: p.resolved,
      thought: p.thought,
      explore: p.explore,
      actions: p.actions,
      edits: p.editIds,
      terms: p.termIds
    }))
  });
}
