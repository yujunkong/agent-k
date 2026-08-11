import * as assert from 'assert';
import { validateSemantics } from '../../../../src/plan/v2/validators/SemanticValidator';
import type { PlanLLMOutput } from '../../../../src/plan/v2/schema';

function plan(tasks: PlanLLMOutput['tasks']): PlanLLMOutput {
  return { summary: 'test', tasks, risks: [] };
}

const existingFiles = new Set(['src/foo.ts', 'src/bar.ts']);
const fileExists = (p: string) => existingFiles.has(p);

suite('Plan V2 — SemanticValidator', () => {
  test('passes for a clean plan', async () => {
    const issues = await validateSemantics(
      plan([
        {
          id: 'task-1',
          title: 't',
          description: 'd',
          files: [{ path: 'src/foo.ts', intent: 'modify' }],
          dependencies: [],
          verification: ['npm test']
        }
      ]),
      { fileExists }
    );
    assert.strictEqual(issues.filter((i) => i.severity === 'error').length, 0);
  });

  test('flags FILE_NOT_FOUND for modify/read intent on a missing file', async () => {
    const issues = await validateSemantics(
      plan([
        {
          id: 'task-1',
          title: 't',
          description: 'd',
          files: [{ path: 'src/missing.ts', intent: 'modify' }],
          dependencies: [],
          verification: []
        }
      ]),
      { fileExists }
    );
    assert.ok(issues.some((i) => i.code === 'FILE_NOT_FOUND'));
  });

  test('does NOT flag a missing file when intent is "create"', async () => {
    const issues = await validateSemantics(
      plan([
        {
          id: 'task-1',
          title: 't',
          description: 'd',
          files: [{ path: 'src/new-file.ts', intent: 'create' }],
          dependencies: [],
          verification: []
        }
      ]),
      { fileExists }
    );
    assert.ok(!issues.some((i) => i.code === 'FILE_NOT_FOUND'));
  });

  test('flags DEPENDENCY_MISSING for a dangling dependency', async () => {
    const issues = await validateSemantics(
      plan([
        { id: 'task-1', title: 't', description: 'd', files: [], dependencies: ['task-99'], verification: [] }
      ]),
      { fileExists }
    );
    assert.ok(issues.some((i) => i.code === 'DEPENDENCY_MISSING'));
  });

  test('flags self-dependency as DEPENDENCY_CYCLE', async () => {
    const issues = await validateSemantics(
      plan([{ id: 'task-1', title: 't', description: 'd', files: [], dependencies: ['task-1'], verification: [] }]),
      { fileExists }
    );
    assert.ok(issues.some((i) => i.code === 'DEPENDENCY_CYCLE'));
  });

  test('detects a longer dependency cycle (task-1 -> task-2 -> task-1)', async () => {
    const issues = await validateSemantics(
      plan([
        { id: 'task-1', title: 't1', description: 'd', files: [], dependencies: ['task-2'], verification: [] },
        { id: 'task-2', title: 't2', description: 'd', files: [], dependencies: ['task-1'], verification: [] }
      ]),
      { fileExists }
    );
    assert.ok(issues.some((i) => i.code === 'DEPENDENCY_CYCLE'));
  });

  test('missing verification is a warning, not an error', async () => {
    const issues = await validateSemantics(
      plan([{ id: 'task-1', title: 't', description: 'd', files: [], dependencies: [], verification: [] }]),
      { fileExists }
    );
    const noVerification = issues.find((i) => i.code === 'NO_VERIFICATION');
    assert.ok(noVerification);
    assert.strictEqual(noVerification?.severity, 'warning');
  });

  test('empty task list is EMPTY_TASK_LIST error', async () => {
    const issues = await validateSemantics(plan([]), { fileExists });
    assert.ok(issues.some((i) => i.code === 'EMPTY_TASK_LIST'));
  });
});
