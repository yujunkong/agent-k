/**
 * INT-002 — planExecute uses wired SubagentHost (no force-main stub).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionPlan } from '@agent-k/plan';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/tmp/repo' } }],
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === 'provider.baseUrl') return 'http://127.0.0.1:1234/v1';
        if (key === 'provider.model') return 'test-model';
        if (key === 'provider.apiKey') return undefined;
        if (key === 'turnTimeoutMs') return 0;
        return undefined;
      },
    }),
  },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  languages: { getDiagnostics: () => [] },
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  window: { createOutputChannel: () => ({ appendLine: () => undefined }) },
}));

vi.mock('./wiredSubagentHost', () => ({
  createWiredSubagentHost: vi.fn(() => ({
    create: (parentTurnId: string, prompt: string, role?: string) => ({
      id: 'sub-test-1',
      parentTurnId,
      prompt,
      role: role || 'coding',
      status: 'pending',
      createdAt: Date.now(),
    }),
    run: async (task: { id: string; status: string }) => ({
      ...task,
      status: 'completed',
      completedAt: Date.now(),
      worktree: {
        path: '/tmp/wt-sub-test-1',
        branch: 'agent-k/sub-test-1',
        base: '/tmp/repo',
      },
    }),
    cancel: () => false,
    cancelAll: () => undefined,
    runFromToolArgs: async () => ({ success: true }),
    reviewWorktree: () => ({ files: [], filesChanged: 0 }),
    applyWorktree: async () => ({ success: true }),
    rejectWorktree: async () => undefined,
  })),
}));

vi.mock('./subagentWorktreeRegistry', () => ({
  registerSubagentWorktree: vi.fn(),
}));

vi.mock('@agent-k/plan', async () => {
  const actual = await vi.importActual<typeof import('@agent-k/plan')>(
    '@agent-k/plan',
  );
  return {
    ...actual,
    runPlanExecution: vi.fn(async (plan: ExecutionPlan, deps: any) => {
      const task = plan.tasks[0];
      expect(task.execution).toBe('subagent');
      const created = deps.subagentHost.create('parent', 'prompt', 'coding');
      const finished = await deps.subagentHost.run(created);
      expect(finished.status).toBe('completed');
      deps.registerWorktree?.(finished.id, '/tmp/repo', finished.worktree);
      return { ...plan, status: 'completed' };
    }),
  };
});

import { runHostPlanExecute } from './planExecute';
import { createWiredSubagentHost } from './wiredSubagentHost';
import { registerSubagentWorktree } from './subagentWorktreeRegistry';

describe('INT-002 planExecute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not force tasks to main and uses wired SubagentHost', async () => {
    const posts: unknown[] = [];
    const webview = {
      postMessage: (msg: unknown) => {
        posts.push(msg);
        return Promise.resolve();
      },
    } as any;

    const plan: ExecutionPlan = {
      id: 'plan_int002',
      goal: 'Ship INT-002',
      repoRoot: '/tmp/repo',
      status: 'approved',
      createdAt: Date.now(),
      approvedAt: Date.now(),
      tasks: [
        {
          id: 't1',
          title: 'Write code',
          description: 'Edit a file',
          files: [{ path: 'src/a.ts', intent: 'modify' }],
          dependencies: [],
          verification: [],
          status: 'pending',
          execution: 'subagent',
        },
      ],
    };

    await runHostPlanExecute(
      { webview },
      {
        requestId: 'req-1' as any,
        sessionId: 'sess-1',
        executionPlan: plan,
        repoRoot: '/tmp/repo',
        baseUrl: 'http://127.0.0.1:1234/v1',
        model: 'test-model',
      },
    );

    expect(createWiredSubagentHost).toHaveBeenCalled();
    expect(registerSubagentWorktree).toHaveBeenCalledWith(
      'sub-test-1',
      '/tmp/repo',
      expect.objectContaining({ path: '/tmp/wt-sub-test-1' }),
    );
    expect(
      posts.some(
        (p) =>
          p &&
          typeof p === 'object' &&
          (p as { type?: string }).type === 'plan.execution.started',
      ),
    ).toBe(true);
  });
});
