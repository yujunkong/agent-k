/**
 * CONV-018 — attach each TerminalRunPreview to the Curiosity phase that owns
 * the matching shell action. Turn-only scoring collapses every card onto the
 * first "Ran a command" phase when several shell phases share one agent turn.
 */
import type { TerminalRunPreview } from './types';

export type TerminalCardAction = {
  id: string;
  kind: string;
  toolName?: string;
  detail?: string;
  label?: string;
  turn?: number;
};

export type TerminalCardPhase = {
  id: string;
  actions: TerminalCardAction[];
};

function isShellAction(a: TerminalCardAction): boolean {
  return (
    a.kind === 'running' ||
    a.toolName === 'run_terminal_cmd' ||
    a.toolName === 'terminal_output'
  );
}

function inferTurn(step: { id: string; turn?: number }): number {
  if (typeof step.turn === 'number' && step.turn > 0) return step.turn;
  const m = step.id.match(/(?:thinking|planning|tool|step)[^\d]*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

function commandsMatch(
  actionText: string | undefined,
  command: string | undefined
): boolean {
  const a = String(actionText || '').trim();
  const b = String(command || '').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.startsWith(a.replace(/…$/, ''))) return true;
  if (a.startsWith(b.slice(0, Math.min(b.length, 40)))) return true;
  return false;
}

function scorePhaseForTerm(p: TerminalCardPhase, turn: number): number {
  const hasRunOnTurn = p.actions.some(
    (a) => isShellAction(a) && inferTurn(a) === turn
  );
  const hasRun = p.actions.some(isShellAction);
  const hasAnyAction = p.actions.some((a) => inferTurn(a) === turn);
  if (hasRunOnTurn) return 100;
  if (hasRun && hasAnyAction) return 80;
  if (hasRun) return 55;
  if (hasAnyAction) return 40;
  return 0;
}

function pickPhaseByTurn(
  phases: TerminalCardPhase[],
  turn: number
): TerminalCardPhase | null {
  let best: TerminalCardPhase | null = null;
  let bestScore = -1;
  for (const p of phases) {
    const s = scorePhaseForTerm(p, turn);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  if (bestScore <= 0) {
    return (
      [...phases].reverse().find((p) => p.actions.length > 0) ||
      phases[phases.length - 1] ||
      null
    );
  }
  return best;
}

/** Find phase that owns this run — toolId first, then unused command match. */
function phaseForTerminalRun(
  phases: TerminalCardPhase[],
  tr: TerminalRunPreview,
  usedActionIds: Set<string>
): TerminalCardPhase | null {
  // Comment: host stamps toolId = tool.call.id = MessageStep.id
  if (tr.toolId) {
    const byId = phases.find((p) =>
      p.actions.some((a) => isShellAction(a) && a.id === tr.toolId)
    );
    if (byId) {
      usedActionIds.add(tr.toolId);
      return byId;
    }
  }

  const cmd = tr.command || tr.description;
  if (cmd) {
    for (const p of phases) {
      for (const a of p.actions) {
        if (!isShellAction(a) || usedActionIds.has(a.id)) continue;
        const text = `${a.detail || ''} ${a.label || ''}`;
        if (commandsMatch(a.detail, cmd) || commandsMatch(text, cmd)) {
          usedActionIds.add(a.id);
          return p;
        }
      }
    }
  }

  const turn = typeof tr.turn === 'number' && tr.turn > 0 ? tr.turn : 0;
  if (turn > 0) return pickPhaseByTurn(phases, turn);
  return (
    [...phases].reverse().find((p) => p.actions.some(isShellAction)) ||
    phases[phases.length - 1] ||
    null
  );
}

/**
 * Map phaseId → terminal cards for that phase (each run once, order preserved).
 */
export function assignTerminalCardsToPhases(
  phases: TerminalCardPhase[],
  terminalRuns: TerminalRunPreview[]
): Map<string, TerminalRunPreview[]> {
  const terms = new Map<string, TerminalRunPreview[]>();
  for (const p of phases) terms.set(p.id, []);

  const usedTerm = new Set<string>();
  const usedActionIds = new Set<string>();

  for (const tr of terminalRuns) {
    if (!tr?.id || usedTerm.has(tr.id)) continue;
    const phase = phaseForTerminalRun(phases, tr, usedActionIds);
    if (!phase) continue;
    usedTerm.add(tr.id);
    terms.get(phase.id)!.push(tr);
  }

  return terms;
}
