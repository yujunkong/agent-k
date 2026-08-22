/**
 * Pure Curiosity-phase builder for MessageSteps.
 * Cuts Exploring at mid-message / Edit / Command (afterStepId anchors).
 */
import {
  looksLikeExploreContinue,
  looksLikeExploreStart,
  looksLikeExploreSettled,
  looksLikeVisibleMidReply
} from './exploreProseHints';
import { looksLikeVisibleTurnProse } from './planPromote';

/** Compatible with MessageSteps.MessageStep */
export type CuriosityStep = {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  toolName?: string;
  turn?: number;
  thoughtRole?: 'opening' | 'mid';
  itemStatus: 'running' | 'done' | 'error';
  durationMs?: number;
  /** Workspace path for clickable explore detail links */
  openPath?: string;
};

export type TurnProseNote = {
  id: string;
  turn: number;
  content: string;
  afterStepId?: string;
};

export type ExploreRow = {
  type: 'tool' | 'thought';
  step: CuriosityStep;
};

export type CuriosityPhase = {
  id: string;
  openingThought?: CuriosityStep;
  leadProse: Array<{ id: string; content: string }>;
  rows: ExploreRow[];
  proseAfter: Array<{ id: string; content: string }>;
  resolved: boolean;
  actions: CuriosityStep[];
};

function isMeta(kind: string): boolean {
  return kind === 'thinking' || kind === 'planning' || kind === 'done';
}

function isExploreStep(s: CuriosityStep): boolean {
  if (isMeta(s.kind)) return false;
  const n = (s.toolName || '').toLowerCase();
  if (
    n === 'read_file' ||
    n === 'read_files' ||
    n === 'grep' ||
    n === 'glob' ||
    n === 'file_search' ||
    n === 'codebase_search' ||
    n === 'list_dir' ||
    n === 'read_lints' ||
    n === 'web_search' ||
    n === 'web_fetch'
  ) {
    return true;
  }
  return s.kind === 'searching' || s.kind === 'reading' || s.kind === 'browsing';
}

function isNoiseAction(s: CuriosityStep): boolean {
  if (s.kind === 'session') return true;
  const n = s.toolName || '';
  return (
    n === 'todo_write' ||
    n === 'switch_mode' ||
    n === 'checkpoint_create' ||
    n === 'checkpoint_restore'
  );
}

function isActionStep(s: CuriosityStep): boolean {
  if (isMeta(s.kind)) return false;
  if (isNoiseAction(s)) return false;
  return !isExploreStep(s);
}

function inferTurn(step: CuriosityStep): number {
  if (typeof step.turn === 'number' && step.turn > 0) return step.turn;
  const m = step.id.match(/(?:thinking|planning|tool|step)[^\d]*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

export type BuildCuriosityPhasesOpts = {
  liveProse?: string;
  isStreaming?: boolean;
  /** Final answer body flowing — settle open Exploring (no Planning) */
  hasLiveAnswer?: boolean;
};

/** Build Curiosity phases — Exploring cut at mid prose / Edit / Command. */
export function buildCuriosityPhases(
  steps: CuriosityStep[],
  turnProse: TurnProseNote[] = [],
  opts: BuildCuriosityPhasesOpts = {}
): CuriosityPhase[] {
  const { liveProse, isStreaming, hasLiveAnswer } = opts;
  const out: CuriosityPhase[] = [];
  let cur: CuriosityPhase | null = null;

  const startPhase = (opening?: CuriosityStep): CuriosityPhase => {
    const p: CuriosityPhase = {
      id: `phase_${out.length + 1}`,
      openingThought: opening,
      leadProse: [],
      rows: [],
      proseAfter: [],
      resolved: false,
      actions: []
    };
    out.push(p);
    return p;
  };

  const hasExploreTools = (p: CuriosityPhase) =>
    p.rows.some((r) => r.type === 'tool');

  const closeExplore = () => {
    if (cur && !cur.resolved && hasExploreTools(cur)) cur.resolved = true;
  };

  const byTurn = new Map<number, CuriosityStep[]>();
  for (const s of steps) {
    const t = inferTurn(s);
    if (!byTurn.has(t)) byTurn.set(t, []);
    byTurn.get(t)!.push(s);
  }
  const proseByTurn = new Map<number, TurnProseNote[]>();
  for (const p of turnProse) {
    const t = typeof p.turn === 'number' && p.turn > 0 ? p.turn : 1;
    if (!proseByTurn.has(t)) proseByTurn.set(t, []);
    proseByTurn.get(t)!.push(p);
  }

  const turnKeys = new Set<number>([
    ...byTurn.keys(),
    ...proseByTurn.keys()
  ]);
  const turns = [...turnKeys].sort((a, b) => a - b);

  for (const turn of turns) {
    // Comment: notes flush by afterStepId so mid prose cuts Exploring mid-batch.
    const notes = [...(proseByTurn.get(turn) || [])];
    const list = byTurn.get(turn) || [];
    let noteIdx = 0;

    const foldAsideIntoThought = (noteId: string, text: string) => {
      if (!cur) cur = startPhase(undefined);
      if (cur.openingThought) {
        const prev = String(cur.openingThought.detail || '').trim();
        if (prev.includes(text)) return;
        cur.openingThought = {
          ...cur.openingThought,
          detail: prev ? `${prev}\n\n${text}` : text
        };
        return;
      }
      if (hasExploreTools(cur) && !cur.resolved) {
        cur.rows.push({
          type: 'thought',
          step: {
            id: noteId,
            kind: 'thinking',
            label: 'Thought',
            detail: text,
            itemStatus: 'done',
            thoughtRole: 'mid'
          }
        });
        return;
      }
      cur.openingThought = {
        id: noteId,
        kind: 'thinking',
        label: 'Thought',
        detail: text,
        itemStatus: 'done',
        thoughtRole: 'opening'
      };
    };

    /**
     * Place one sealed prose note. Mid / dig / settle cut open Exploring;
     * do not hoist dig intent to a new phase lead (chronological proseAfter).
     */
    const placeNote = (note: TurnProseNote) => {
      const text = String(note.content || '').trim();
      if (!text) return;
      if (!cur) cur = startPhase(undefined);
      const payload = { id: note.id, content: text };
      const digIntent =
        looksLikeExploreStart(text) || looksLikeExploreContinue(text);
      const visibleCut =
        looksLikeVisibleTurnProse(text) ||
        looksLikeVisibleMidReply(text) ||
        digIntent ||
        looksLikeExploreSettled(text);

      if (visibleCut && hasExploreTools(cur) && !cur.resolved) {
        cur.resolved = true;
        cur.proseAfter.push(payload);
        cur = startPhase(undefined);
        return;
      }

      if (looksLikeExploreSettled(text) && hasExploreTools(cur)) {
        cur.resolved = true;
        cur.proseAfter.push(payload);
        return;
      }

      if (cur.resolved || cur.actions.length > 0) {
        if (cur.actions.length > 0 || hasExploreTools(cur)) {
          cur.proseAfter.push(payload);
          cur = startPhase(undefined);
          return;
        }
      }

      if (hasExploreTools(cur) && !cur.resolved) {
        foldAsideIntoThought(note.id, text);
        return;
      }

      // Chronological lead before first tools — not a special top hoist
      if (cur.actions.length > 0) {
        cur.proseAfter.push(payload);
      } else {
        cur.leadProse.push(payload);
      }
    };

    const flushNotesAfter = (afterId: string | undefined) => {
      while (noteIdx < notes.length) {
        const n = notes[noteIdx];
        const anchor = n.afterStepId;
        if (afterId === undefined) {
          if (anchor) break;
        } else if (anchor !== afterId) {
          break;
        }
        noteIdx += 1;
        placeNote(n);
      }
    };

    flushNotesAfter(undefined);

    for (const s of list) {
      if (s.kind === 'planning' || s.kind === 'done') continue;

      if (s.kind === 'thinking') {
        const text = (s.detail || '').trim();
        const live = s.itemStatus === 'running';
        if (!text && !live) continue;

        if (s.id) {
          const owned = out.find((p) => p.openingThought?.id === s.id);
          if (owned) {
            owned.openingThought = { ...s, thoughtRole: 'opening' };
            cur = owned;
            flushNotesAfter(s.id);
            continue;
          }
          const midIdx = out.findIndex((p) =>
            p.rows.some((r) => r.type === 'thought' && r.step.id === s.id)
          );
          if (midIdx >= 0) {
            const phase = out[midIdx];
            phase.rows = phase.rows.map((r) =>
              r.type === 'thought' && r.step.id === s.id
                ? {
                    type: 'thought' as const,
                    step: { ...s, thoughtRole: 'mid' as const }
                  }
                : r
            );
            cur = phase;
            flushNotesAfter(s.id);
            continue;
          }
        }

        if (!cur || cur.resolved || cur.actions.length > 0) {
          cur = startPhase({ ...s, thoughtRole: 'opening' });
        } else if (hasExploreTools(cur) && !cur.resolved) {
          cur.rows.push({
            type: 'thought',
            step: { ...s, thoughtRole: 'mid' }
          });
        } else if (
          cur.openingThought &&
          cur.openingThought.id &&
          s.id &&
          cur.openingThought.id !== s.id
        ) {
          cur = startPhase({ ...s, thoughtRole: 'opening' });
        } else {
          cur.openingThought = { ...s, thoughtRole: 'opening' };
        }
        flushNotesAfter(s.id);
        continue;
      }

      if (isExploreStep(s)) {
        if (cur && cur.actions.length > 0) {
          cur = startPhase(undefined);
        } else if (!cur || cur.resolved) {
          cur = startPhase(undefined);
        }
        cur.rows.push({ type: 'tool', step: s });
        flushNotesAfter(s.id);
        continue;
      }

      if (isActionStep(s)) {
        // Edit / Command always close open Exploring, then own a new phase
        closeExplore();
        if (!cur || cur.resolved || (cur && hasExploreTools(cur))) {
          cur = startPhase(undefined);
        }
        cur.actions.push(s);
        flushNotesAfter(s.id);
        continue;
      }
    }

    while (noteIdx < notes.length) {
      placeNote(notes[noteIdx++]);
    }
  }

  // Answer body or settle prose → close Exploring (Planning must not linger)
  if (
    (hasLiveAnswer || liveProse?.trim()) &&
    cur &&
    !cur.resolved &&
    hasExploreTools(cur)
  ) {
    cur.resolved = true;
  }

  if (!isStreaming) {
    const anyRunning = steps.some(
      (s) =>
        s.itemStatus === 'running' &&
        (s.kind === 'thinking' || isExploreStep(s) || isActionStep(s))
    );
    if (!anyRunning && cur && !cur.resolved && hasExploreTools(cur)) {
      cur.resolved = true;
    }
  }

  return out;
}
