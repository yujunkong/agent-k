/**
 * ADDON-T14: AgentReviewLoop — empty diff no-op, LM review merge, parse helper
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { AgentReviewLoop, parseReviewFindingsJson } from '../../../src/review/AgentReviewLoop';

suite('ADDON-T14 parseReviewFindingsJson (pure)', () => {
  test('parses a direct JSON array', () => {
    const findings = parseReviewFindingsJson(
      JSON.stringify([{ file: 'a.ts', line: 3, severity: 'error', message: 'boom' }])
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].file, 'a.ts');
    assert.strictEqual(findings[0].severity, 'error');
    assert.strictEqual(findings[0].message, 'boom');
  });

  test('extracts a fenced ```json``` block from prose', () => {
    const text = [
      'Here is my review:',
      '```json',
      '[{"file":"b.ts","line":1,"severity":"warning","message":"unused var"}]',
      '```',
      'Let me know if you need more.'
    ].join('\n');
    const findings = parseReviewFindingsJson(text);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].file, 'b.ts');
    assert.strictEqual(findings[0].severity, 'warning');
  });

  test('extracts a bare [...] span embedded in text without fences', () => {
    const text = 'Findings: [{"file":"c.ts","message":"missing null check"}] — done.';
    const findings = parseReviewFindingsJson(text);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].file, 'c.ts');
    assert.strictEqual(findings[0].severity, 'info'); // default
  });

  test('supports a {findings: [...]} wrapper object', () => {
    const findings = parseReviewFindingsJson(
      JSON.stringify({ findings: [{ file: 'd.ts', message: 'x' }] })
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].file, 'd.ts');
  });

  test('drops entries without a message, keeps valid ones', () => {
    const findings = parseReviewFindingsJson(
      JSON.stringify([{ file: 'e.ts' }, { file: 'f.ts', message: 'ok' }])
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].file, 'f.ts');
  });

  test('invalid severity falls back to info', () => {
    const findings = parseReviewFindingsJson(
      JSON.stringify([{ file: 'g.ts', message: 'x', severity: 'critical' }])
    );
    assert.strictEqual(findings[0].severity, 'info');
  });

  test('garbage / empty text never throws — returns []', () => {
    assert.deepStrictEqual(parseReviewFindingsJson(''), []);
    assert.deepStrictEqual(parseReviewFindingsJson('not json at all'), []);
    assert.deepStrictEqual(parseReviewFindingsJson('{"broken": '), []);
  });
});

suite('ADDON-T14 AgentReviewLoop — git-backed', () => {
  let repoRoot: string;

  setup(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-review-'));
    execSync('git init -q', { cwd: repoRoot });
    execSync('git config user.email "test@agentk.local"', { cwd: repoRoot });
    execSync('git config user.name "Agent K Test"', { cwd: repoRoot });
    fs.writeFileSync(path.join(repoRoot, 'a.ts'), 'export const a = 1;\n');
    execSync('git add . && git commit -q -m init', { cwd: repoRoot });
  });

  teardown(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  test('reviewDiff: empty diff → no-op empty result', () => {
    const loop = new AgentReviewLoop(repoRoot);
    const result = loop.reviewDiff();
    assert.deepStrictEqual(result.findings, []);
    assert.strictEqual(result.diffSummary, '');
    assert.strictEqual(result.totalFiles, 0);
  });

  test('reviewWithLM: empty diff → no-op even with a provider configured', async () => {
    const loop = new AgentReviewLoop(repoRoot);
    let called = false;
    const result = await loop.reviewWithLM({
      complete: async () => {
        called = true;
        return '[]';
      }
    });
    assert.deepStrictEqual(result.findings, []);
    assert.strictEqual(called, false);
  });

  test('reviewWithLM: no provider falls back to static reviewDiff', async () => {
    fs.writeFileSync(path.join(repoRoot, 'a.ts'), 'export const a = 1; // TODO: fix\n');
    const loop = new AgentReviewLoop(repoRoot);
    const result = await loop.reviewWithLM(undefined);
    assert.ok(result.diffSummary.length > 0);
  });

  test('reviewWithLM: merges LM findings with static hints', async () => {
    fs.writeFileSync(path.join(repoRoot, 'a.ts'), 'export const a = 1; console.log(a);\n');
    const loop = new AgentReviewLoop(repoRoot);
    const result = await loop.reviewWithLM({
      complete: async (prompt: string) => {
        assert.ok(prompt.includes('## Code Review Request'));
        return JSON.stringify([
          { file: 'a.ts', line: 1, severity: 'warning', message: 'LM: prefer const over var here' }
        ]);
      }
    });
    const lmFinding = result.findings.find((f) => f.message.startsWith('LM:'));
    assert.ok(lmFinding, 'expected the LM finding to be merged in');
    // Static console.log hint should still be present alongside the LM finding
    assert.ok(result.findings.some((f) => /console\.log/i.test(f.message)));
  });

  test('reviewWithLM: LM failure degrades to static findings only (never throws)', async () => {
    fs.writeFileSync(path.join(repoRoot, 'a.ts'), 'export const a = 1; // TODO\n');
    const loop = new AgentReviewLoop(repoRoot);
    const staticOnly = loop.reviewDiff();
    const result = await loop.reviewWithLM({
      complete: async () => {
        throw new Error('provider unreachable');
      }
    });
    assert.deepStrictEqual(result.findings, staticOnly.findings);
  });
});
