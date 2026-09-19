/**
 * CONV-014 — Thought/shell timeline order regression.
 *
 * RCA: host main loop emitted tool.start/tool.end without `turn`, so the
 * webview defaulted every tool step to turn=1 while Thought steps carried
 * incrementing per-turn numbers. buildCuriosityPhases regroups steps by
 * inferTurn (ascending) → a later-turn shell was pulled into the turn-1
 * bucket and rendered ABOVE later Thought cards ("stuck to the previous card").
 *
 * Fix: host rides `turn` on tool lifecycle events (wiredSubagentHost parity).
 * These cases pin the grouping contract the fix depends on.
 */
import { describe, expect, it } from 'vitest';
import { buildCuriosityPhases } from './curiosityPhases';
import type { CuriosityStep } from './curiosityPhases';

function th(id: string, turn: number, ms: number): CuriosityStep {
  return {
    id,
    kind: 'thinking',
    label: 'Thought',
    detail: `reasoning ${id}`,
    turn,
    itemStatus: 'done',
    durationMs: ms
  };
}

function shell(id: string, turn: number): CuriosityStep {
  return {
    id,
    kind: 'running',
    label: 'run_terminal_cmd',
    toolName: 'run_terminal_cmd',
    detail: 'cd backend && python3 -m pytest tests -q',
    turn,
    itemStatus: 'running'
  };
}

/** Flatten phase layout into render order (actions walk order = DOM order). */
function renderOrder(steps: CuriosityStep[]): string[] {
  const order: string[] = [];
  for (const p of buildCuriosityPhases(steps)) {
    for (const a of p.actions) order.push(a.id);
    for (const r of p.rows) order.push(r.step.id);
  }
  return order;
}

describe('CONV-014 thought/shell timeline order', () => {
  it('thoughts that arrived before the shell render above it', () => {
    const steps = [
      th('tl_thinking_1', 1, 6000),
      th('tl_thinking_1_s1', 1, 15000),
      th('tl_thinking_1_s2', 1, 6000),
      th('tl_thinking_1_s3', 1, 28000),
      shell('call_1', 1)
    ];
    const order = renderOrder(steps);
    expect(order.indexOf('tl_thinking_1')).toBeLessThan(
      order.indexOf('call_1')
    );
  });

  it('later-turn shell with correct turn renders below earlier thoughts', () => {
    // Host now rides turn on tool.start — shell from model turn 5 must not
    // be regrouped into the turn-1 bucket above thoughts 2-4.
    const steps = [
      th('tl_thinking_1', 1, 6000),
      th('tl_thinking_2', 2, 15000),
      th('tl_thinking_3', 3, 6000),
      th('tl_thinking_4', 4, 28000),
      th('tl_thinking_5', 5, 46000),
      shell('call_1', 5)
    ];
    const order = renderOrder(steps);
    const shellIdx = order.indexOf('call_1');
    for (const id of [
      'tl_thinking_1',
      'tl_thinking_2',
      'tl_thinking_3',
      'tl_thinking_4',
      'tl_thinking_5'
    ]) {
      expect(order.indexOf(id)).toBeLessThan(shellIdx);
    }
  });
});
