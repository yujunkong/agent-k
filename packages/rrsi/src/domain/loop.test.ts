import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RRSILoop, type LoopDeps } from './loop';
import { Domain, type TaskRunOutput } from './domain';
import { DEFAULT_CONFIG } from '../types';

class FakeDomain extends Domain {
  get name(): string {
    return 'fake';
  }
  private ids = ['t1', 't2', 't3'];
  evolveIds(): string[] {
    return this.ids;
  }
  async run(task: { id: string }): Promise<TaskRunOutput> {
    return { taskId: task.id, completed: true, testsPassed: 1, testsFailed: 0 };
  }
}

function makeDeps(dir: string, script: Array<Record<string, unknown>>): LoopDeps & { calls: number } {
  let call = 0;
  const wts: string[] = [];
  return {
    calls: 0,
    domain: new FakeDomain(),
    generate: async () => {
      const s = JSON.stringify(script[Math.min(call++, script.length - 1)]);
      return s;
    },
    evaluate: async ({ policyDir, tasks, k }) => {
      // Score depends on verification steps length: longer policy = better.
      const bundle = JSON.parse(
        fs.readFileSync(path.join(policyDir, 'verification.policy.json'), 'utf-8')
      );
      void k;
      const bonus = bundle.steps.length >= 3 ? 0.2 : 0;
      const out: Record<string, TaskRunOutput[]> = {};
      for (const t of tasks) {
        out[t.id] = Array.from({ length: k }, () => ({
          taskId: t.id,
          completed: true,
          // 1 of 2 requirements met at baseline; both with the bonus policy
          testsPassed: bonus > 0 ? 2 : 1,
          testsFailed: bonus > 0 ? 0 : 1,
        }));
      }
      return out;
    },
    createWorktree: async (name) => {
      const p = path.join(dir, name);
      fs.mkdirSync(p, { recursive: true });
      wts.push(p);
      return p;
    },
    removeWorktree: async (wt) => {
      const i = wts.indexOf(wt);
      if (i >= 0) wts.splice(i, 1);
    },
    log: undefined,
  };
}

describe('RRSI loop (in-memory domain)', () => {
  let root: string;
  let policiesDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rrsi-loop-'));
    policiesDir = path.join(root, 'policies');
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(
      path.join(policiesDir, 'verification.policy.json'),
      JSON.stringify({ steps: ['one'] })
    );
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const proposerScript = [
    {
      edits: [
        {
          file: 'verification.policy.json',
          content: JSON.stringify({ steps: ['one', 'two', 'three'] }),
          component: 'prompt',
          hypothesis: 'more steps verify more',
        },
      ],
    },
  ];

  it('baseline seeds the frontier', async () => {
    const deps = makeDeps(root, proposerScript);
    const loop = new RRSILoop(
      { runsDir: path.join(root, 'runs'), policiesDir },
      deps,
      { ...DEFAULT_CONFIG, delta: 0.017, m: 1, T: 2 }
    );
    const ev = await loop.baseline();
    expect(ev.S).toBeGreaterThan(0);
    const fr = JSON.parse(
      fs.readFileSync(path.join(root, 'runs', 'frontier.json'), 'utf-8')
    );
    expect(fr.SStar).toBe(ev.S);
  });

  it('round accepts an improving candidate and fast-forwards the incumbent policy', async () => {
    const deps = makeDeps(root, proposerScript);
    const loop = new RRSILoop(
      { runsDir: path.join(root, 'runs'), policiesDir },
      deps,
      { ...DEFAULT_CONFIG, delta: 0.017, m: 1, T: 2 }
    );
    await loop.baseline();
    const { winner, decisions } = await loop.round(0);
    expect(decisions).toHaveLength(1);
    expect(winner).toBe('A');
    // Incumbent policy now has 3 steps.
    const applied = JSON.parse(
      fs.readFileSync(path.join(policiesDir, 'verification.policy.json'), 'utf-8')
    );
    expect(applied.steps).toHaveLength(3);
    // History recorded the accepted edit.
    const hist = fs.readFileSync(path.join(root, 'runs', 'history.jsonl'), 'utf-8');
    expect(hist).toContain('ACCEPTED');
  });

  it('rejects proposer output touching non-policy files', async () => {
    const deps = makeDeps(root, [
      {
        edits: [
          {
            file: '../../core/agent.ts',
            content: 'process.exit(1)',
            component: 'control_flow',
            hypothesis: 'bad',
          },
        ],
      },
    ]);
    const loop = new RRSILoop(
      { runsDir: path.join(root, 'runs'), policiesDir },
      deps,
      { ...DEFAULT_CONFIG, delta: 0.017, m: 1, T: 2 }
    );
    await loop.baseline();
    const { winner } = await loop.round(0);
    expect(winner).toBeNull();
    const hist = fs.readFileSync(path.join(root, 'runs', 'history.jsonl'), 'utf-8');
    expect(hist).toContain('critic_reject');
  });

  it('rejects schema-invalid policy content', async () => {
    const deps = makeDeps(root, [
      {
        edits: [
          {
            file: 'verification.policy.json',
            content: JSON.stringify({ steps: ['ok'], evil: 'rm -rf /' }),
            component: 'config',
            hypothesis: 'sneaky key',
          },
        ],
      },
    ]);
    const loop = new RRSILoop(
      { runsDir: path.join(root, 'runs'), policiesDir },
      deps,
      { ...DEFAULT_CONFIG, delta: 0.017, m: 1, T: 2 }
    );
    await loop.baseline();
    const { winner } = await loop.round(0);
    expect(winner).toBeNull();
    const hist = fs.readFileSync(path.join(root, 'runs', 'history.jsonl'), 'utf-8');
    expect(hist).toContain('unknown key');
  });
});
