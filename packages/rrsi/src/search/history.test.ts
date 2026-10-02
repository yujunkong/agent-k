import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { History } from './history';
import { budgetTable } from './schedule';
import { recoverComponent, textOnly } from './components';
import { screenDiff } from './critic';

describe('RRSI schedule.editBudget', () => {
  it('anneals from b_max toward b_min over T rounds', () => {
    const table = budgetTable(4, 1, 4); // t = 0..3
    expect(table).toHaveLength(4);
    expect(table[0]).toBe(4);
    expect(table[3]).toBe(2); // cos(3π/4) mid-anneal
    const late = budgetTable(20, 1, 4);
    expect(late[0]).toBe(4);
    // monotone non-increasing anneal toward b_min
    for (let t = 1; t < late.length; t++) {
      expect(late[t]!).toBeLessThanOrEqual(late[t - 1]!);
    }
  });
});

describe('RRSI components', () => {
  it('textOnly recognizes pure string edits as prompt', () => {
    expect(textOnly("+ 'hello world'\n- 'old'")).toBe(true);
    expect(textOnly('+ "key": "value"')).toBe(true);
    expect(textOnly('+  foo();')).toBe(false);
  });

  it('recoverComponent falls back on diff signals', () => {
    expect(recoverComponent('+ const m = new Memory();')).toBe('memory');
    expect(recoverComponent('+ registry.register_tool("x", spec)')).toBe('client_tool');
    expect(recoverComponent('+ // just a comment')).toBe('prompt');
  });
});

describe('RRSI critic.screenDiff', () => {
  it('rejects credentials', () => {
    const r = screenDiff(`+ const k = "sk-abcdefghijklmnopqrstuv";`);
    expect(r).toContain('credential in diff');
  });

  it('passes clean general-procedure diffs', () => {
    expect(screenDiff(`+ Verify each requirement before finalizing.`)).toEqual([]);
  });

  it('applies domain patterns', () => {
    const r = screenDiff(`+ if (taskId === 'extract-elf') skip();`, [
      { pattern: /taskId === '/, reason: 'task-id branching' },
    ]);
    expect(r).toContain('task-id branching');
  });
});

describe('RRSI history', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrsi-hist-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('records per-edit rows and computes tried/prune sets', () => {
    const h = new History(path.join(dir, 'h.jsonl'));
    h.appendCandidate({
      t: 0,
      variant: 'A',
      edits: [
        { id: 'C1', component: 'prompt', hypothesis: 'more verify steps' },
      ],
      outcome: 'ACCEPTED',
      deltaS: 0.03,
      deltaC: 0.02,
      accepted: true,
      S: 0.83,
      C: 21000,
      diff: 'diff',
    });
    h.appendCandidate({
      t: 1,
      variant: 'B',
      edits: [{ id: 'C1', component: 'memory', hypothesis: 'bad idea' }],
      outcome: 'REJECTED',
      deltaS: -0.01,
      deltaC: 0.1,
      accepted: false,
      S: 0.79,
      C: 22000,
      diff: 'diff2',
    });
    expect(h.tried()).toEqual(new Set(['prompt', 'memory']));
    const prune = h.pruneSet(1, 4);
    expect(prune.map((p) => p.component)).toContain('memory');
    expect(h.has(0, 'A')).toBe(true);
    expect(h.has(0, 'Z')).toBe(false);
  });

  it('unmeasured candidates do not enter the tried set', () => {
    const h = new History(path.join(dir, 'h.jsonl'));
    h.appendCandidate({
      t: 0,
      variant: 'A',
      edits: [{ id: 'C1', component: 'skill', hypothesis: 'x' }],
      outcome: 'critic_reject',
      deltaS: null,
      deltaC: null,
      accepted: false,
      S: null,
      C: null,
      diff: null,
    });
    expect(h.tried().size).toBe(0);
  });
});
