/**
 * REVIEW-001~006 unit tests (v2.1 동작 동등)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PendingStore } from './PendingStore';
import { CheckboxSync } from './CheckboxSync';
import { LintRunner } from './LintRunner';
import { AgentReviewLoop, parseReviewFindingsJson } from './AgentReviewLoop';
import { AcceptFix } from './AcceptFix';
import { UndoManager } from './Undo';
import { ApplySelected } from './ApplySelected';
import { CheckpointManager } from '@agent-k/safety';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-review-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('REVIEW-005 PendingStore', () => {
  it('add/get/getAll/remove', () => {
    const store = new PendingStore();
    store.add({
      filePath: 'a.ts',
      hunks: [{ oldText: 'x', newText: 'y', applied: false }],
      originalContent: 'x',
      modifiedContent: 'y',
      timestamp: Date.now(),
    });
    expect(store.get('a.ts')?.modifiedContent).toBe('y');
    expect(store.getAll()).toHaveLength(1);
    expect(store.hasPending()).toBe(true);
    expect(store.remove('a.ts')).toBe(true);
    expect(store.hasPending()).toBe(false);
  });

  it('undo stack push/pop', () => {
    const store = new PendingStore();
    store.add({
      filePath: 'a.ts',
      hunks: [],
      originalContent: '',
      modifiedContent: '',
      timestamp: Date.now(),
    });
    const popped = store.popUndo();
    expect(popped?.filePath).toBe('a.ts');
    expect(store.hasPending()).toBe(false);
    expect(store.getUndoStack()).toHaveLength(0);
  });
});

describe('REVIEW-006 CheckboxSync', () => {
  it('file toggle unchecks all hunks', () => {
    const sync = new CheckboxSync();
    sync.toggleHunk('a.ts', 0, true);
    sync.toggleHunk('a.ts', 1, true);
    sync.toggleFile('a.ts', false);
    expect(sync.isHunkChecked('a.ts', 0)).toBe(false);
    expect(sync.isHunkChecked('a.ts', 1)).toBe(false);
    expect(sync.isFileChecked('a.ts')).toBe(false);
  });

  it('all hunks checked auto-checks file', () => {
    const sync = new CheckboxSync();
    sync.toggleHunk('a.ts', 0, true);
    sync.toggleHunk('a.ts', 1, true);
    expect(sync.isFileChecked('a.ts')).toBe(true);
    sync.toggleHunk('a.ts', 1, false);
    expect(sync.isFileChecked('a.ts')).toBe(false);
  });

  it('getSelectedFiles/Hunks', () => {
    const sync = new CheckboxSync();
    sync.toggleFile('a.ts', true);
    sync.toggleFile('b.ts', false);
    sync.toggleHunk('a.ts', 2, true);
    expect(sync.getSelectedFiles()).toEqual(['a.ts']);
    expect(sync.getSelectedHunks('a.ts')).toEqual([2]);
  });
});

describe('REVIEW-004 LintRunner', () => {
  it('scans ts files for heuristic issues', async () => {
    const file = path.join(tmpDir, 'bad.ts');
    fs.writeFileSync(file, 'const x: any = 1;\nconsole.log(x);\n// TODO fix\n');
    const runner = new LintRunner();
    const errors = await runner.runLint([file]);
    const codes = errors.map((e) => e.code);
    expect(codes).toContain('no-explicit-any');
    expect(codes).toContain('no-console');
    expect(codes).toContain('no-todo');
  });

  it('ignores missing files', async () => {
    const runner = new LintRunner();
    const errors = await runner.runLint([path.join(tmpDir, 'nope.ts')]);
    expect(errors).toHaveLength(0);
  });
});

describe('REVIEW-001/002 AgentReviewLoop', () => {
  it('empty diff → no-op', () => {
    const loop = new AgentLoop(tmpDir);
    const result = loop.reviewDiff();
    expect(result.findings).toHaveLength(0);
    expect(result.diffSummary).toBe('');
  });

  it('parses review findings JSON robustly', () => {
    expect(parseReviewFindingsJson('')).toEqual([]);
    expect(parseReviewFindingsJson('not json')).toEqual([]);
    expect(parseReviewFindingsJson('[{"message":"bug","severity":"error"}]')).toHaveLength(1);
    expect(parseReviewFindingsJson('```json\n[{"message":"fenced"}]\n```')).toHaveLength(1);
    expect(parseReviewFindingsJson('prose [{"message":"span"}] tail')).toHaveLength(1);
    // malformed items dropped
    expect(parseReviewFindingsJson('[{"noMessage":true},{"message":"ok"}]')).toHaveLength(1);
  });

  it('reviewWithLM merges static + LM findings', async () => {
    // Use a real git repo with a diff
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-arl-'));
    try {
      const { execFileSync } = require('child_process') as typeof import('child_process');
      const run = (args: string[]) =>
        execFileSync('git', args, { cwd: repo, encoding: 'utf-8' });
      run(['init', '-q']);
      run(['config', 'user.email', 't@t']);
      run(['config', 'user.name', 't']);
      fs.writeFileSync(path.join(repo, 'x.ts'), 'const a = 1;\n');
      run(['add', '.']);
      run(['commit', '-q', '-m', 'init']);
      fs.writeFileSync(path.join(repo, 'x.ts'), 'const a = 1;\nconsole.log(a); // TODO\n');

      const loop = new AgentLoop(repo);
      const result = await loop.reviewWithLM({
        complete: async () => '[{"file":"x.ts","line":2,"severity":"warning","message":"no-console"}]',
      });
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
      expect(result.findings.some((f) => f.id.startsWith('lm-'))).toBe(true);
      expect(result.findings.some((f) => f.id.startsWith('static-'))).toBe(true);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

// Alias to keep the describe blocks short
const AgentLoop = AgentReviewLoop;

describe('REVIEW-003 AcceptFix', () => {
  it('TODO/FIXME findings have no automatic fix', async () => {
    const fix = new AcceptFix();
    const result = await fix.accept({
      id: 's1',
      file: 'a.ts',
      line: 0,
      severity: 'info',
      message: 'Found TODO/FIXME/HACK markers in diff',
    });
    expect(result.applied).toBe(false);
  });

  it('console.log findings suggest removal', async () => {
    const fix = new AcceptFix();
    const result = await fix.accept({
      id: 's2',
      file: 'a.ts',
      line: 3,
      severity: 'warning',
      message: 'Found console.log/debug statements in diff',
    });
    expect(result.applied).toBe(true);
    expect(result.patch).toContain('Remove console.log');
  });

  it('acceptBatch processes all findings', async () => {
    const fix = new AcceptFix();
    const results = await fix.acceptBatch([
      { id: 'a', file: 'x.ts', line: 1, severity: 'info', message: 'Found TODO/FIXME markers' },
      { id: 'b', file: 'y.ts', line: 2, severity: 'warning', message: 'console.log found' },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].applied).toBe(false);
    expect(results[1].applied).toBe(true);
  });
});

describe('REVIEW-006 Undo + ApplySelected', () => {
  it('undo restores snapshot map from checkpoint', async () => {
    const cp = new CheckpointManager();
    cp.create({ 'a.ts': 'before' }, { label: 'Apply 1 file(s)', trigger: 'n_files' });
    const undo = new UndoManager(cp);
    const result = await undo.undoLast();
    expect(result.restored).toEqual(['a.ts']);
    expect(result.failed).toHaveLength(0);
  });

  it('undo with unknown checkpoint fails gracefully', async () => {
    const undo = new UndoManager(new CheckpointManager());
    const result = await undo.undo('nope');
    expect(result.restored).toHaveLength(0);
    expect(result.failed).toEqual(['nope']);
  });

  it('undoToLabel finds latest matching label', async () => {
    const cp = new CheckpointManager();
    cp.create({ 'a.ts': 'x' }, { label: 'first', trigger: 't' });
    cp.create({ 'b.ts': 'y' }, { label: 'Apply 2 file(s)', trigger: 'n_files' });
    const undo = new UndoManager(cp);
    const result = await undo.undoToLabel('Apply');
    expect(result.restored).toEqual(['b.ts']);
  });

  it('ApplySelected stages checked files only', async () => {
    const file = path.join(tmpDir, 'staged.ts');
    fs.writeFileSync(file, 'original\n');
    const change = {
      filePath: file,
      hunks: [{ oldText: 'original', newText: 'modified', applied: false }],
      originalContent: 'original\n',
      modifiedContent: 'modified\n',
      timestamp: Date.now(),
    };
    const apply = new ApplySelected(new CheckpointManager());
    const result = await apply.apply([change], [file], new Map());
    expect(result.applied).toEqual([file]);
    expect(result.contents[file]).toBe('modified\n');
    // on-disk content unchanged (host applies)
    expect(fs.readFileSync(file, 'utf-8')).toBe('original\n');
  });

  it('ApplySelected skips missing files and empty hunk selections', async () => {
    const change = {
      filePath: path.join(tmpDir, 'missing.ts'),
      hunks: [{ oldText: 'a', newText: 'b', applied: false }],
      originalContent: 'a',
      modifiedContent: 'b',
      timestamp: Date.now(),
    };
    const apply = new ApplySelected(new CheckpointManager());
    const result = await apply.apply([change], [change.filePath], new Map());
    expect(result.skipped).toEqual([change.filePath]);
    expect(result.applied).toHaveLength(0);
  });
});
