/**
 * BON-001~005 + SCM-001 unit tests (v2.1 동작 동등)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorktreeManager } from './WorktreeManager';
import { BestOfN } from './BestOfN';
import { CommitMessageGenerator } from './CommitMessageGenerator';

let tmpDir: string;
let manager: WorktreeManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-bon-'));
  fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  manager = new WorktreeManager(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('BON-001 BestOfN fan-out', () => {
  it('runs N trials with injected runner', async () => {
    const bon = new BestOfN(manager, async ({ trial }) => ({
      success: true,
      output: `done in ${trial.worktree.branch}`,
    }));
    const trials = await bon.run({
      n: 2,
      models: ['m1'],
      prompts: ['p1'],
      task: 'task',
    });
    expect(trials).toHaveLength(2);
    expect(trials.every((t) => t.status === 'success')).toBe(true);
  });

  it('marks failing trials as failure', async () => {
    const bon = new BestOfN(manager, async () => ({
      success: false,
      error: 'boom',
    }));
    const trials = await bon.run({
      n: 1,
      models: ['m1'],
      prompts: ['p1'],
      task: 'task',
    });
    expect(trials[0].status).toBe('failure');
    expect(trials[0].error).toBe('boom');
  });
});

describe('BON-002 candidate comparison', () => {
  it('getWinner picks successful trial with lowest token usage', async () => {
    let i = 0;
    const bon = new BestOfN(manager, async () => {
      i++;
      return { success: true, output: `t${i}` };
    });
    const trials = await bon.run({
      n: 2,
      models: ['m1'],
      prompts: ['p1'],
      task: 'task',
    });
    trials[0].tokenUsage = { input: 500, output: 100 };
    trials[1].tokenUsage = { input: 100, output: 50 };
    const winner = bon.getWinner();
    expect(winner?.id).toBe(trials[1].id);
  });

  it('getWinner returns null when no successful trials', async () => {
    const bon = new BestOfN(manager, async () => ({ success: false }));
    await bon.run({ n: 1, models: ['m1'], prompts: ['p1'], task: 'task' });
    expect(bon.getWinner()).toBeNull();
  });
});

describe('BON-003 candidate diff', () => {
  it('getTrialDiff returns empty for unknown trial', async () => {
    const bon = new BestOfN(manager, async () => ({ success: true }));
    await bon.run({ n: 1, models: ['m1'], prompts: ['p1'], task: 'task' });
    expect(bon.getTrialDiff('nope')).toBe('');
  });

  it('getWinnerDiff returns empty when no winner', async () => {
    const bon = new BestOfN(manager, async () => ({ success: false }));
    await bon.run({ n: 1, models: ['m1'], prompts: ['p1'], task: 'task' });
    expect(bon.getWinnerDiff()).toBe('');
  });
});

describe('BON-004 adopt winner', () => {
  it('adoptWinner returns winner and keeps it registered', async () => {
    const bon = new BestOfN(manager, async () => ({ success: true }));
    const trials = await bon.run({
      n: 2,
      models: ['m1'],
      prompts: ['p1'],
      task: 'task',
    });
    trials[0].tokenUsage = { input: 10, output: 0 };
    trials[1].tokenUsage = { input: 100, output: 0 };
    const winner = await bon.adoptWinner();
    expect(winner?.id).toBe(trials[0].id);
  });

  it('adoptWinner returns null with no winner', async () => {
    const bon = new BestOfN(manager, async () => ({ success: false }));
    await bon.run({ n: 1, models: ['m1'], prompts: ['p1'], task: 'task' });
    expect(await bon.adoptWinner()).toBeNull();
  });
});

describe('SCM-001 CommitMessageGenerator', () => {
  it('returns no-changes message when nothing staged', async () => {
    const gen = new CommitMessageGenerator(tmpDir);
    const msg = await gen.generateCommitMessage();
    expect(msg.title).toBe('(no staged changes)');
  });

  it('fallback generates conventional title from staged diff', async () => {
    // fake git via repoRoot is not a real repo — execGit returns '' → no changes path.
    // For fallback title coverage, use a real git repo.
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-scm-'));
    try {
      const run = (args: string[]) =>
        (require('child_process') as typeof import('child_process')).execFileSync('git', args, {
          cwd: repo,
          encoding: 'utf-8',
        });
      run(['init', '-q']);
      run(['config', 'user.email', 't@t']);
      run(['config', 'user.name', 't']);
      fs.writeFileSync(path.join(repo, 'feat.txt'), 'a\n');
      run(['add', '.']);
      const gen = new CommitMessageGenerator(repo);
      const msg = await gen.generateCommitMessage({ style: 'conventional' });
      expect(msg.title).not.toBe('(no staged changes)');
      expect(msg.title).toMatch(/^(feat|fix|chore|test|docs|refactor)/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('LM provider generates message from diff', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-scm2-'));
    try {
      const { execFileSync } = require('child_process') as typeof import('child_process');
      const run = (args: string[]) =>
        execFileSync('git', args, { cwd: repo, encoding: 'utf-8' });
      run(['init', '-q']);
      run(['config', 'user.email', 't@t']);
      run(['config', 'user.name', 't']);
      fs.writeFileSync(path.join(repo, 'x.txt'), 'a\n');
      run(['add', '.']);

      const gen = new CommitMessageGenerator(repo);
      gen.setLMProvider({
        generate: async () =>
          '{"title":"feat(core): add thing","body":"does a thing"}',
      });
      const msg = await gen.generateCommitMessage();
      expect(msg.title).toBe('feat(core): add thing');
      expect(msg.body).toBe('does a thing');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('parses fenced JSON LM responses', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-scm3-'));
    try {
      const { execFileSync } = require('child_process') as typeof import('child_process');
      const run = (args: string[]) =>
        execFileSync('git', args, { cwd: repo, encoding: 'utf-8' });
      run(['init', '-q']);
      run(['config', 'user.email', 't@t']);
      run(['config', 'user.name', 't']);
      fs.writeFileSync(path.join(repo, 'x.txt'), 'a\n');
      run(['add', '.']);

      const gen = new CommitMessageGenerator(repo);
      gen.setLMProvider({
        generate: async () => '```json\n{"title":"fix: bug","body":""}\n```',
      });
      const msg = await gen.generateCommitMessage();
      expect(msg.title).toBe('fix: bug');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
