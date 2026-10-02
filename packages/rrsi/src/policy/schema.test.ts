import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  defaultPolicy,
  loadPolicyBundle,
  policyToLoopConfig,
  validatePolicySection,
} from './schema';

describe('RRSI policy schema', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrsi-pol-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('defaults load without a directory', () => {
    const { bundle, errors, loaded } = loadPolicyBundle(path.join(dir, 'none'));
    expect(errors).toEqual([]);
    expect(loaded).toEqual([]);
    expect(bundle.verification.verificationFirst).toBe(true);
    expect(policyToLoopConfig(bundle).maxTurns).toBe(25);
  });

  it('accepts a valid verification policy', () => {
    const res = validatePolicySection('verification', {
      verificationFirst: true,
      verificationMicroLoop: true,
      steps: ['inspect git diff', 'verify each requirement'],
      maxPostEditAttempts: 4,
    });
    expect(res.ok).toBe(true);
  });

  it('rejects unknown keys and type drift', () => {
    const res = validatePolicySection('verification', {
      verificationFirst: 'yes',
      evilCode: 'rm -rf',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.includes('evilCode'))).toBe(true);
      expect(res.errors.some((e) => e.includes('verificationFirst'))).toBe(true);
    }
  });

  it('rejects out-of-enum extraSteps and signals', () => {
    expect(validatePolicySection('microloop', { extraSteps: ['self_destruct'] }).ok).toBe(false);
    expect(validatePolicySection('prefetch', { signals: ['read_user_secrets'] }).ok).toBe(false);
    expect(validatePolicySection('microloop', { extraSteps: ['repair'] }).ok).toBe(true);
  });

  it('rejects worker.maxTurns out of range', () => {
    expect(validatePolicySection('worker', { maxTurns: 500 }).ok).toBe(false);
  });

  it('loads a bundle from disk and merges over defaults', () => {
    fs.writeFileSync(
      path.join(dir, 'verification.policy.json'),
      JSON.stringify({ steps: ['run targeted tests'] })
    );
    const { bundle, errors, loaded } = loadPolicyBundle(dir);
    expect(errors).toEqual([]);
    expect(loaded).toEqual(['verification.policy.json']);
    expect(bundle.verification.steps).toEqual(['run targeted tests']);
    expect(bundle.verification.verificationFirst).toBe(true);
  });

  it('keeps defaults when a file is malformed', () => {
    fs.writeFileSync(path.join(dir, 'worker.policy.json'), '{ nope');
    const { bundle, errors } = loadPolicyBundle(dir);
    expect(errors.length).toBe(1);
    expect(bundle.worker.maxTurns).toBe(defaultPolicy().worker.maxTurns);
  });
});
