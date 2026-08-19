import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  validateExecutionPlanContext,
  validateTaskExecutionLaunch,
  preflightTaskFiles,
  formatPreflightReport
} from '../../../../src/plan/execution/validateExecutionContext';
import type { ExecutionPlan, ExecutionPlanTask } from '../../../../src/plan/execution/types';

function basePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    id: 'plan_ctx',
    goal: 'Test',
    status: 'executing',
    approvedTaskIds: ['t1'],
    createdAt: 1,
    repoRoot: '/workspace/agent-k',
    tasks: [
      {
        id: 't1',
        title: 'Task',
        description: 'Do work',
        dependencies: [],
        files: [],
        verification: [],
        execution: 'main',
        status: 'ready'
      }
    ],
    ...overrides
  };
}

function taskWithFiles(
  files: ExecutionPlanTask['files'],
  overrides: Partial<ExecutionPlanTask> = {}
): ExecutionPlanTask {
  return {
    id: 't1',
    title: 'Task',
    description: 'Do work',
    dependencies: [],
    files,
    verification: [],
    execution: 'subagent',
    status: 'ready',
    ...overrides
  };
}

suite('Plan execution — validateExecutionContext', () => {
  test('validateExecutionPlanContext detects repoRoot mismatch', () => {
    const issue = validateExecutionPlanContext(basePlan(), '/other/repo');
    assert.strictEqual(issue?.code, 'REPO_ROOT_MISMATCH');
    assert.ok(issue?.message.includes('/workspace/agent-k'));
    assert.strictEqual(validateExecutionPlanContext(basePlan(), '/workspace/agent-k'), null);
  });

  test('validateTaskExecutionLaunch fails on missing modify target at execution time', () => {
    const plan = basePlan({ repoRoot: os.tmpdir() });
    const task = taskWithFiles([
      {
        path: 'src/main.rs',
        intent: 'modify',
        resolution: 'unresolved',
        exists: false
      }
    ]);
    const issue = validateTaskExecutionLaunch(plan, task, os.tmpdir());
    assert.strictEqual(issue?.code, 'UNRESOLVED_TASK_TARGETS');
    assert.ok(issue?.message.includes('src/main.rs'));
    assert.ok(issue?.message.includes('intent: modify'));
  });

  test('validateTaskExecutionLaunch allows create intent even if file missing', () => {
    const plan = basePlan({ repoRoot: os.tmpdir() });
    const task = taskWithFiles([
      { path: 'src/new-module.ts', intent: 'create', resolution: 'resolved', exists: false }
    ]);
    assert.strictEqual(validateTaskExecutionLaunch(plan, task, os.tmpdir()), null);
  });

  test('preflightTaskFiles re-checks file existence at execution time', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
    try {
      const existingFile = path.join(tmpDir, 'real.ts');
      fs.writeFileSync(existingFile, '// exists');

      const plan = basePlan({ repoRoot: tmpDir });
      const task = taskWithFiles([
        { path: 'real.ts', intent: 'modify', resolution: 'resolved', exists: true },
        { path: 'ghost.ts', intent: 'modify', resolution: 'unresolved', exists: false },
        { path: 'new.ts', intent: 'create', resolution: 'resolved', exists: false }
      ]);

      const report = preflightTaskFiles(plan, task, tmpDir);
      assert.strictEqual(report.effectiveRoot, tmpDir);
      assert.strictEqual(report.entries.length, 3);

      const realEntry = report.entries.find((e) => e.path === 'real.ts')!;
      assert.strictEqual(realEntry.verdict, 'ok');
      assert.strictEqual(realEntry.executionTimeExists, true);

      const ghostEntry = report.entries.find((e) => e.path === 'ghost.ts')!;
      assert.strictEqual(ghostEntry.verdict, 'missing_target');
      assert.strictEqual(ghostEntry.executionTimeExists, false);

      const newEntry = report.entries.find((e) => e.path === 'new.ts')!;
      assert.strictEqual(newEntry.verdict, 'create_ok');
      assert.strictEqual(newEntry.executionTimeExists, false);

      assert.strictEqual(report.blocked, true);
      assert.strictEqual(report.issue?.code, 'UNRESOLVED_TASK_TARGETS');
      assert.ok(report.issue?.message.includes('ghost.ts'));
      assert.ok(report.issue?.message.includes('intent: modify'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('preflightTaskFiles uses worktreePath when available', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'lib.ts'), '// in worktree');

      const plan = basePlan({ repoRoot: '/nonexistent/root' });
      const task = taskWithFiles(
        [{ path: 'lib.ts', intent: 'modify', resolution: 'resolved', exists: true }],
        { worktreePath: tmpDir }
      );

      const report = preflightTaskFiles(plan, task, '/nonexistent/root');
      assert.strictEqual(report.effectiveRoot, tmpDir);
      assert.strictEqual(report.entries[0]?.verdict, 'ok');
      assert.strictEqual(report.entries[0]?.executionTimeExists, true);
      assert.strictEqual(report.blocked, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('formatPreflightReport produces readable diagnostic', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-'));
    try {
      const plan = basePlan({ repoRoot: tmpDir });
      const task = taskWithFiles([
        { path: 'src/auth.ts', intent: 'modify', resolution: 'unresolved', exists: false }
      ]);
      const report = preflightTaskFiles(plan, task, tmpDir);
      const text = formatPreflightReport(report);
      assert.ok(text.includes('Task Preflight Report: t1'));
      assert.ok(text.includes('execution: subagent'));
      assert.ok(text.includes('blocked: true'));
      assert.ok(text.includes('[missing_target] src/auth.ts'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
