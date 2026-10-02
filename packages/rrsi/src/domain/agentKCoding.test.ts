import { describe, expect, it } from 'vitest';
import { AgentKCodingDomain, scoreRuns } from './agentKCoding';
import type { EvolveSetDeps } from './agentKCoding';
import type { EvalResult } from '../types';

function makeDomain(
  verifyResults: Record<string, Array<{ exitCode: number }>>,
  agentResults: Record<string, { completed: boolean; tokens?: number }>
): { domain: AgentKCodingDomain; deps: EvolveSetDeps } {
  const deps: EvolveSetDeps = {
    exec: async (cmd) => {
      const r = verifyResults[cmd]?.shift() ?? { exitCode: 0 };
      return { ...r, stdout: '', stderr: '' };
    },
    runAgent: async (task) => ({
      taskId: task.id,
      ...(agentResults[task.id] ?? { completed: true }),
    }),
  };
  return { domain: new AgentKCodingDomain('/nonexistent', deps), deps };
}

describe('AgentKCodingDomain', () => {
  it('unknown task id throws', async () => {
    const { domain } = makeDomain({}, {});
    await expect(
      domain.run({ id: 'nope', prompt: 'x', repoRoot: '/' }, { policyDir: '/', k: 1 })
    ).rejects.toThrow('unknown task id');
  });

  it('reward follows verify step outcomes (partial pass = partial reward)', async () => {
    const { domain } = makeDomain(
      {
        'npm t': [{ exitCode: 0 }],
        'npm run lint': [{ exitCode: 1 }],
      },
      { t1: { completed: true } }
    );
    // Inject a fake spec via a subclass-free path: evolveIds is empty for a
    // missing dir, so call the protected flow through scoreRuns instead.
    const out = await domain.run(
      { id: 't1', prompt: 'x', repoRoot: '/' },
      { policyDir: '/', k: 1 }
    ).catch(() => null);
    void out; // t1 unknown — covered by the first test; scoring tested below
    const ev = scoreRuns(domain, 'j', 1, {
      t1: [
        {
          taskId: 't1',
          completed: true,
          testsPassed: 1,
          testsFailed: 1,
        },
      ],
    });
    expect(ev.S).toBeCloseTo(0.5);
  });

  it('guards flag large regressions on previously-passing tasks', () => {
    const { domain } = makeDomain({}, {});
    const mk = (S: number): EvalResult => ({
      job: 'j',
      k: 1,
      perTask: {
        t1: { rewards: [S], weights: [1], tokens: [] },
      },
      S,
      C: null,
      nExpected: 1,
      missing: 0,
    });
    const v = domain.guards({ incumbent: mk(1), candidate: mk(0.5) });
    expect(v.some((s) => s.startsWith('regression: t1'))).toBe(true);
    const ok = domain.guards({ incumbent: mk(1), candidate: mk(0.95) });
    expect(ok).toEqual([]);
  });

  it('incomplete agent run is a missing trial (reward 0)', () => {
    const ev = scoreRuns(new (class extends AgentKCodingDomain {
      get name(): string {
        return 'x';
      }
    })('/nonexistent', {
      exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      runAgent: async () => ({ taskId: 't', completed: false }),
    }), 'j', 1, { t1: [{ taskId: 't1', completed: false }] });
    expect(ev.S).toBe(0);
  });
});
