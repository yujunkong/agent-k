import * as assert from 'assert';
import { buildExecutionPlan } from '../../../../src/plan/execution/buildExecutionPlan.ts';
import {
  executeNextPlanTask,
  runPlanExecution
} from '../../../../src/plan/execution/planExecutionEngine.ts';
import type { SubagentHostLike } from '../../../../src/plan/execution/subagentTaskBridge.ts';
import type { SubagentTask } from '../../../../src/agent/subagents';
import { createSubagentTask, patchSubagentTask } from '../../../../src/agent/subagents';
import type { PlanDocument } from '../../../../src/plan/v2/schema';

function mixedPlan(): PlanDocument {
  return {
    id: 'plan_exec',
    goal: 'JWT migration',
    summary: 'JWT',
    createdAt: 1,
    risks: [],
    tasks: [
      {
        id: 'analyze',
        title: 'Analyze auth',
        description: 'Read current auth',
        files: [{ path: 'src/auth.ts', intent: 'read' }],
        dependencies: [],
        verification: []
      },
      {
        id: 'implement',
        title: 'Implement JWT',
        description: 'Add middleware',
        files: [{ path: 'src/middleware/jwt.ts', intent: 'create' }],
        dependencies: ['analyze'],
        verification: []
      },
      {
        id: 'verify',
        title: 'Run verification',
        description: 'Run tests',
        files: [],
        dependencies: ['implement'],
        verification: ['npm test']
      }
    ]
  };
}

function mockSubagentHost(
  behavior: 'success' | 'fail' = 'success'
): SubagentHostLike {
  const tasks = new Map<string, SubagentTask>();
  return {
    create(parentTurnId, prompt, role = 'general') {
      const task = createSubagentTask(parentTurnId, prompt, role);
      tasks.set(task.id, task);
      return task;
    },
    async run(task) {
      const current = tasks.get(task.id) ?? task;
      if (behavior === 'fail') {
        const failed = patchSubagentTask(current, {
          status: 'failed',
          error: 'mock failure'
        });
        tasks.set(task.id, failed);
        return failed;
      }
      const finished = patchSubagentTask(current, {
        status: 'completed',
        result: 'ok',
        worktree: {
          path: `/tmp/worktrees/${task.id}`,
          branch: `plan/${task.id}`,
          baseRef: 'HEAD'
        }
      });
      tasks.set(task.id, finished);
      return finished;
    }
  };
}

suite('Plan execution — planExecutionEngine', () => {
  test('executeNextPlanTask runs main task first', async () => {
    const plan = buildExecutionPlan(mixedPlan(), { status: 'executing' });
    const mainRuns: string[] = [];

    const step = await executeNextPlanTask(plan, {
      parentTurnId: 'turn-1',
      subagentHost: mockSubagentHost(),
      runMainTask: async ({ task }) => {
        mainRuns.push(task.id);
        return { success: true };
      }
    });

    assert.strictEqual(step.executed, true);
    assert.strictEqual(step.taskId, 'analyze');
    assert.strictEqual(mainRuns.join(','), 'analyze');
    assert.strictEqual(step.plan.tasks.find((t) => t.id === 'analyze')?.status, 'completed');
  });

  test('runPlanExecution walks main → subagent → main', async () => {
    const plan = buildExecutionPlan(mixedPlan(), { status: 'executing' });
    const sequence: string[] = [];
    const registered: string[] = [];

    const finalPlan = await runPlanExecution(plan, {
      parentTurnId: 'turn-2',
      subagentHost: mockSubagentHost(),
      repoRoot: '/repo',
      registerWorktree: (subagentId) => registered.push(subagentId),
      runMainTask: async ({ task }) => {
        sequence.push(`main:${task.id}`);
        return { success: true };
      },
      hooks: {
        onTaskStarted: (_plan, task) => sequence.push(`start:${task.id}`)
      }
    });

    assert.strictEqual(finalPlan.status, 'completed');
    assert.ok(sequence.includes('start:analyze'));
    assert.ok(sequence.includes('main:analyze'));
    assert.ok(sequence.includes('start:implement'));
    assert.ok(sequence.includes('start:verify'));
    assert.ok(sequence.includes('main:verify'));
    assert.strictEqual(
      finalPlan.tasks.find((task) => task.id === 'implement')?.subagentId?.startsWith('subagent-'),
      true
    );
    assert.ok(finalPlan.tasks.find((task) => task.id === 'implement')?.worktreePath);
    assert.strictEqual(registered.length, 1);
  });

  test('subagent failure stops execution and marks plan failed', async () => {
    const plan = buildExecutionPlan(mixedPlan(), { status: 'executing' });
    const mainRuns: string[] = [];

    const finalPlan = await runPlanExecution(plan, {
      parentTurnId: 'turn-3',
      subagentHost: mockSubagentHost('fail'),
      runMainTask: async ({ task }) => {
        mainRuns.push(task.id);
        return { success: true };
      }
    });

    assert.strictEqual(finalPlan.status, 'failed');
    assert.deepStrictEqual(mainRuns, ['analyze']);
    assert.strictEqual(
      finalPlan.tasks.find((task) => task.id === 'implement')?.status,
      'failed'
    );
    assert.strictEqual(
      finalPlan.tasks.find((task) => task.id === 'verify')?.status,
      'blocked'
    );
  });

  test('unresolved file targets fail before subagent dispatch', async () => {
    const doc = mixedPlan();
    doc.tasks[1]!.files = [
      {
        path: 'src/main.rs',
        intent: 'modify',
        resolution: 'unresolved',
        exists: false
      }
    ];
    const plan = buildExecutionPlan(
      { ...doc, repoRoot: '/workspace/agent-k' },
      { status: 'executing' }
    );
    const mainRuns: string[] = [];
    const subagentHost = mockSubagentHost();

    const finalPlan = await runPlanExecution(plan, {
      parentTurnId: 'turn-4',
      repoRoot: '/workspace/agent-k',
      subagentHost,
      runMainTask: async ({ task }) => {
        mainRuns.push(task.id);
        return { success: true };
      }
    });

    assert.strictEqual(finalPlan.status, 'failed');
    assert.deepStrictEqual(mainRuns, ['analyze']);
    assert.strictEqual(
      finalPlan.tasks.find((task) => task.id === 'implement')?.status,
      'failed'
    );
  });
});
