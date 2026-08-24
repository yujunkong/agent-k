/**
 * Pure Curiosity-phase builder for MessageSteps.
 * Arrival order only: Thought → mid-reply → explore/cards.
 * Sole coalesce: adjacent Thinking with the same id (live stream upserts).
 */
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
  subagentId?: string;
  role?: string;
  description?: string;
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
  const n = (s.toolName || '').toLowerCase();
  if (n === 'task' || n === 'task_run') return true;
  return (
    n === 'todo_write' ||
    n === 'switch_mode' ||
    n === 'checkpoint_create' ||
    n === 'checkpoint_restore'
  );
}

function isActionStep(s: CuriosityStep): boolean {
  if (isMeta(s.kind)) return false;
  if (s.kind === 'subagent' || s.kind === 'task') return true;
  if (isNoiseAction(s)) return false;
  return !isExploreStep(s);
}

function inferTurn(step: CuriosityStep): number {
  // Comment: SUB-010 — ignore poisoned turn on tl_subagent_* (id digits like mt5s → 5)
  if (step.id.startsWith('tl_subagent_') || step.kind === 'subagent') {
    return 1;
  }
  if (typeof step.turn === 'number' && step.turn > 0) return step.turn;
  const m = step.id.match(/(?:thinking|planning|tool|step)[^\d]*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

/**
 * Merge adjacent Thinking steps with no tool between them into one row.
 * Same id only (live stream upserts). Never glue a sealed Thought to the next
 * segment — that re-opened "Thought" after Read/Ran/Subagent (Cursor break).
 */
export function coalesceAdjacentThinkingSteps(
  steps: CuriosityStep[]
): CuriosityStep[] {
  const out: CuriosityStep[] = [];
  for (const s of steps) {
    if (s.kind !== 'thinking') {
      out.push(s);
      continue;
    }
    const prev = out[out.length - 1];
    if (!prev || prev.kind !== 'thinking') {
      out.push({ ...s });
      continue;
    }
    // Comment: different Thought segments stay separate (tl_thinking_1 vs _s1)
    if (prev.id && s.id && prev.id !== s.id) {
      out.push({ ...s });
      continue;
    }
    // Comment: sealed Thought must not absorb the next dig
    if (
      prev.itemStatus === 'done' ||
      prev.itemStatus === 'error' ||
      s.itemStatus === 'done' ||
      s.itemStatus === 'error'
    ) {
      if (prev.id === s.id) {
        // Same id settling — keep latest status/detail
        out[out.length - 1] = { ...prev, ...s };
      } else {
        out.push({ ...s });
      }
      continue;
    }
    const prevDetail = String(prev.detail || '').trim();
    const nextDetail = String(s.detail || '').trim();
    let detail = prevDetail;
    if (nextDetail) {
      if (!prevDetail) detail = nextDetail;
      else if (nextDetail.startsWith(prevDetail)) detail = nextDetail;
      else if (!prevDetail.includes(nextDetail)) {
        detail = `${prevDetail}\n\n${nextDetail}`;
      }
    }
    const running =
      prev.itemStatus === 'running' || s.itemStatus === 'running';
    const durations = [prev.durationMs, s.durationMs].filter(
      (n): n is number => typeof n === 'number' && Number.isFinite(n)
    );
    const durationMs = running
      ? undefined
      : durations.length
        ? durations.reduce((a, b) => a + b, 0)
        : undefined;
    out[out.length - 1] = {
      ...prev,
      ...s,
      id: prev.id || s.id,
      detail,
      itemStatus: running
        ? 'running'
        : s.itemStatus === 'error' || prev.itemStatus === 'error'
          ? 'error'
          : 'done',
      durationMs,
      label: prev.label || s.label
    };
  }
  return out;
}

function mergeThoughtStep(
  prev: CuriosityStep,
  next: CuriosityStep
): CuriosityStep {
  return coalesceAdjacentThinkingSteps([prev, next])[0]!;
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
    // Comment: collapse adjacent Thinking before phase layout (no tool between)
    const list = coalesceAdjacentThinkingSteps(byTurn.get(turn) || []);
    let noteIdx = 0;

    /**
     * Place one sealed prose note in arrival order.
     * turnProse is always user-visible — never fold into Thought.
     * Never park mid-reply in proseAfter of an action phase: MessageSteps
     * renders ALL actions before proseAfter → Command would sit above the reply.
     */
    const placeNote = (note: TurnProseNote) => {
      const text = String(note.content || '').trim();
      if (!text) return;
      if (!cur) cur = startPhase(undefined);
      const payload = { id: note.id, content: text };

      // Comment: Ran/Edit already on this phase → close it; reply starts the next block
      if (cur.actions.length > 0) {
        cur = startPhase(undefined);
        cur.leadProse.push(payload);
        return;
      }

      // Comment: cut open Exploring so mid-reply sits between dig batches
      if (hasExploreTools(cur) && !cur.resolved) {
        cur.resolved = true;
        cur.proseAfter.push(payload);
        cur = startPhase(undefined);
        return;
      }

      if (hasExploreTools(cur)) {
        cur.resolved = true;
        cur.proseAfter.push(payload);
        cur = startPhase(undefined);
        return;
      }

      cur.leadProse.push(payload);
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
            const ownedIdx = out.indexOf(owned);
            // Comment: SUB-010 — never revive a sealed Thought above a later SubagentRunRow
            const subagentAfter = out
              .slice(ownedIdx + 1)
              .some((p) =>
                p.actions.some(
                  (a) =>
                    a.kind === 'subagent' ||
                    a.kind === 'task' ||
                    (a.toolName || '').toLowerCase() === 'task_run' ||
                    (a.toolName || '').toLowerCase() === 'task'
                )
              );
            const sealed =
              owned.openingThought?.itemStatus === 'done' ||
              owned.openingThought?.itemStatus === 'error';
            if (!(sealed && (live || subagentAfter))) {
              owned.openingThought = { ...s, thoughtRole: 'opening' };
              cur = owned;
              flushNotesAfter(s.id);
              continue;
            }
            // Fall through — new phase below the subagent
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

        // Comment: after a SubagentRunRow phase, next Thought always starts fresh below
        const curHasSubagent =
          !!cur &&
          cur.actions.some(
            (a) =>
              a.kind === 'subagent' ||
              a.kind === 'task' ||
              (a.toolName || '').toLowerCase() === 'task_run' ||
              (a.toolName || '').toLowerCase() === 'task'
          );
        if (!cur || cur.resolved || cur.actions.length > 0 || curHasSubagent) {
          cur = startPhase({ ...s, thoughtRole: 'opening' });
        } else if (hasExploreTools(cur) && !cur.resolved) {
          const last = cur.rows[cur.rows.length - 1];
          if (last?.type === 'thought') {
            last.step = mergeThoughtStep(last.step, {
              ...s,
              thoughtRole: 'mid'
            });
          } else {
            cur.rows.push({
              type: 'thought',
              step: { ...s, thoughtRole: 'mid' }
            });
          }
        } else if (
          cur.openingThought &&
          cur.openingThought.id &&
          s.id &&
          cur.openingThought.id !== s.id
        ) {
          const sealedOpen =
            cur.openingThought.itemStatus === 'done' ||
            cur.openingThought.itemStatus === 'error';
          if (sealedOpen) {
            // Comment: sealed Thought stays closed — next dig is a new phase
            cur = startPhase({ ...s, thoughtRole: 'opening' });
          } else {
            // Comment: consecutive live openings with no tools — merge fragments
            cur.openingThought = mergeThoughtStep(cur.openingThought, {
              ...s,
              thoughtRole: 'opening'
            });
          }
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
        // Comment: SUB-010 — SubagentRunRow owns its phase; later tools/Thought must
        // start *below* it (never glue Ran/Edit into the same phase → row sinks to end).
        // Mid-reply leadProse on cur stays above this action in the same phase (sequential).
        const isSubagentRow =
          s.kind === 'subagent' ||
          s.kind === 'task' ||
          (s.toolName || '').toLowerCase() === 'task' ||
          (s.toolName || '').toLowerCase() === 'task_run';
        const curHasSubagent =
          !!cur &&
          cur.actions.some(
            (a) =>
              a.kind === 'subagent' ||
              a.kind === 'task' ||
              (a.toolName || '').toLowerCase() === 'task_run' ||
              (a.toolName || '').toLowerCase() === 'task'
          );
        if (
          isSubagentRow ||
          curHasSubagent ||
          !cur ||
          cur.resolved ||
          (cur && hasExploreTools(cur)) ||
          (cur && cur.openingThought) ||
          // Comment: mid-reply already on cur → Command/Edit starts below it
          (cur && cur.leadProse.length > 0) ||
          (cur && cur.proseAfter.length > 0)
        ) {
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
