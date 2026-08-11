import * as assert from 'assert';
import { deriveTaskUpdates } from '../../../../src/plan/v2/EvidenceEngine';
import type { PlanTask } from '../../../../src/plan/v2/schema';

const tasks: PlanTask[] = [
  {
    id: 'task-1',
    title: 'Auth service',
    description: 'd',
    files: [{ path: 'src/auth/AuthService.ts', intent: 'create' }],
    dependencies: [],
    verification: ['npm test -- auth']
  },
  {
    id: 'task-2',
    title: 'Routes',
    description: 'd',
    files: [{ path: 'src/routes.ts', intent: 'modify' }],
    dependencies: ['task-1'],
    verification: []
  }
];

suite('Plan V2 — EvidenceEngine', () => {
  test('reading a task file moves it to in_progress', () => {
    const updates = deriveTaskUpdates(
      { toolName: 'read_file', filePath: 'src/auth/AuthService.ts', success: true, timestamp: 1 },
      tasks
    );
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].taskId, 'task-1');
    assert.strictEqual(updates[0].to, 'in_progress');
  });

  test('editing a task file with automatic verification moves it to satisfied on success', () => {
    const updates = deriveTaskUpdates(
      { toolName: 'edit_file', filePath: 'src/auth/AuthService.ts', success: true, timestamp: 1 },
      tasks
    );
    assert.strictEqual(updates[0].to, 'satisfied');
  });

  test('a failed edit moves the task to failed', () => {
    const updates = deriveTaskUpdates(
      { toolName: 'edit_file', filePath: 'src/auth/AuthService.ts', success: false, timestamp: 1 },
      tasks
    );
    assert.strictEqual(updates[0].to, 'failed');
  });

  test('a passing verification command moves the task to verified', () => {
    const updates = deriveTaskUpdates(
      { toolName: 'run_terminal_cmd', command: 'npm test -- auth --watch=false', success: true, timestamp: 1 },
      tasks
    );
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].taskId, 'task-1');
    assert.strictEqual(updates[0].to, 'verified');
  });

  test('a failing verification command moves the task to failed', () => {
    const updates = deriveTaskUpdates(
      { toolName: 'run_terminal_cmd', command: 'npm test -- auth', success: false, timestamp: 1 },
      tasks
    );
    assert.strictEqual(updates[0].to, 'failed');
  });

  test('an unrelated file touch produces no updates', () => {
    const updates = deriveTaskUpdates(
      { toolName: 'edit_file', filePath: 'src/unrelated.ts', success: true, timestamp: 1 },
      tasks
    );
    assert.strictEqual(updates.length, 0);
  });


  test('does not mark a read-only file intent as satisfied after a write', () => {
    const readOnlyTask: PlanTask = {
      id: 'task-read',
      title: 'Inspect config',
      description: 'd',
      files: [{ path: 'src/config.ts', intent: 'read' }],
      dependencies: [],
      verification: []
    };
    const updates = deriveTaskUpdates(
      { toolName: 'edit_file', filePath: 'src/config.ts', success: true, timestamp: 1 },
      [readOnlyTask]
    );
    assert.strictEqual(updates.length, 0);
  });

  test('does not match a bare basename to an unrelated nested file', () => {
    const basenameTask: PlanTask = {
      id: 'task-base',
      title: 'Specific file',
      description: 'd',
      files: [{ path: 'foo.ts', intent: 'modify' }],
      dependencies: [],
      verification: []
    };
    const updates = deriveTaskUpdates(
      { toolName: 'edit_file', filePath: 'src/other/foo.ts', success: true, timestamp: 1 },
      [basenameTask]
    );
    assert.strictEqual(updates.length, 0);
  });

  test('does not accept a longer command with the verification string embedded in it', () => {
    const task: PlanTask = {
      id: 'task-cmd',
      title: 'Tests',
      description: 'd',
      files: [],
      dependencies: [],
      verification: ['npm test']
    };
    const updates = deriveTaskUpdates(
      { toolName: 'run_terminal_cmd', command: 'npm test-old', success: true, timestamp: 1 },
      [task]
    );
    assert.strictEqual(updates.length, 0);
  });

  test('accepts a workspace shell wrapper around the declared verification command', () => {
    const task: PlanTask = {
      id: 'task-cmd-wrapper',
      title: 'Tests',
      description: 'd',
      files: [],
      dependencies: [],
      verification: ['npm test']
    };
    const updates = deriveTaskUpdates(
      { toolName: 'run_terminal_cmd', command: 'cd /workspace && npm test -- auth', success: true, timestamp: 1 },
      [task]
    );
    assert.strictEqual(updates[0]?.to, 'verified');
  });

  test('a write to a task with no automatic verification enters awaiting_verification', () => {
    const task: PlanTask = {
      id: 'manual', title: 'Docs', description: 'd',
      files: [{ path: 'README.md', intent: 'modify' }], dependencies: [], verification: []
    };
    const updates = deriveTaskUpdates({ toolName: 'edit_file', filePath: 'README.md', success: true, timestamp: 1 }, [task]);
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].to, 'awaiting_verification');
  });

  test('a shared-file write is ambiguous and cannot satisfy multiple tasks', () => {
    const sharedTasks: PlanTask[] = [
      { ...tasks[0], files: [{ path: 'src/shared.ts', intent: 'modify' }] },
      { ...tasks[1], id: 'task-3', files: [{ path: 'src/shared.ts', intent: 'modify' }] }
    ];
    const updates = deriveTaskUpdates({ toolName: 'edit_file', filePath: 'src/shared.ts', success: true, timestamp: 1 }, sharedTasks);
    assert.strictEqual(updates.length, 0);
  });

  test('a verification command shared by multiple tasks is ambiguous', () => {
    const sharedVerification: PlanTask[] = [
      { ...tasks[0], verification: ['npm test'] },
      { ...tasks[1], id: 'task-3', verification: ['npm test'] }
    ];
    const updates = deriveTaskUpdates({ toolName: 'run_terminal_cmd', command: 'npm test', success: true, timestamp: 1 }, sharedVerification);
    assert.strictEqual(updates.length, 0);
  });
});
