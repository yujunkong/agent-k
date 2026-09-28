/**
 * V31-INTENT-01 — Intent classifier + gate tests.
 */

import { describe, expect, it } from 'vitest';
import { HeuristicIntentClassifier } from './HeuristicIntentClassifier';
import { IntentGate } from './IntentGate';
import type { IntentClassifierInput } from './IntentClassifier';

const classifier = new HeuristicIntentClassifier();

function input(userText: string, extra: Partial<IntentClassifierInput> = {}) {
  return {
    userText,
    mode: 'agent' as const,
    ...extra,
  };
}

describe('V31-INTENT-01 HeuristicIntentClassifier', () => {
  it('exposes the heuristic classifier id', () => {
    expect(classifier.id).toBe('heuristic-v1');
  });

  it.each(['hi', '안녕', 'hello!'])(
    'classifies greeting %j as conversation with no gates',
    async (text) => {
      const verdict = await classifier.classify(input(text));
      expect(verdict.kind).toBe('conversation');
      expect(verdict.confidence).toBe(0.9);
      expect(verdict.reason).toBe('greeting / small talk');
      expect(verdict.gates).toEqual({
        prefetch: false,
        verificationFirst: false,
        harnessBlocks: false,
        toolSchemas: 'none',
      });
    },
  );

  it('classifies a read-only question as question/readonly', async () => {
    const verdict = await classifier.classify(
      input('what does chatSend.ts do?'),
    );
    expect(verdict.kind).toBe('question');
    expect(verdict.confidence).toBe(0.7);
    expect(verdict.reason).toBe('question / read-only intent');
    expect(verdict.gates).toEqual({
      prefetch: false,
      verificationFirst: false,
      harnessBlocks: false,
      toolSchemas: 'readonly',
    });
  });

  it('classifies an action request as task/full', async () => {
    const verdict = await classifier.classify(
      input('fix the bug in chatSend.ts'),
    );
    expect(verdict.kind).toBe('task');
    expect(verdict.confidence).toBe(0.6);
    expect(verdict.reason).toBe('default task');
    expect(verdict.gates).toEqual({
      prefetch: true,
      verificationFirst: true,
      harnessBlocks: true,
      toolSchemas: 'full',
    });
  });

  it('action verb wins over greeting prefix ("hi, fix the bug")', async () => {
    const verdict = await classifier.classify(input('hi, fix the bug'));
    expect(verdict.kind).toBe('task');
    expect(verdict.gates.toolSchemas).toBe('full');
  });

  it('question marker + action verb stays task', async () => {
    const verdict = await classifier.classify(input('how do I fix this?'));
    expect(verdict.kind).toBe('task');
  });

  it('inline edit is always task (priority 100)', async () => {
    const verdict = await classifier.classify(
      input('hi', { hasInlineEdit: true }),
    );
    expect(verdict.kind).toBe('task');
    expect(verdict.confidence).toBe(0.95);
    expect(verdict.reason).toBe('inline edit request');
    expect(verdict.gates.toolSchemas).toBe('full');
  });

  it('empty / whitespace text falls back to task', async () => {
    for (const text of ['', '   ', '\n\t']) {
      const verdict = await classifier.classify(input(text));
      expect(verdict.kind).toBe('task');
      expect(verdict.reason).toBe('default task');
    }
  });

  it('empty rule list still falls back to task', async () => {
    const bare = new HeuristicIntentClassifier([]);
    const verdict = await bare.classify(input('hi'));
    expect(verdict.kind).toBe('task');
    expect(verdict.gates.toolSchemas).toBe('full');
  });
});

describe('V31-INTENT-01 IntentGate', () => {
  const gate = new IntentGate(classifier);

  it('evaluate delegates to the injected classifier', async () => {
    const verdict = await gate.evaluate(input('안녕'));
    expect(verdict.kind).toBe('conversation');
  });

  it('apply ANDs booleans and keeps the most restrictive toolSchemas', async () => {
    const verdict = await classifier.classify(input('hi'));
    const applied = gate.apply(verdict, {
      prefetch: true,
      verificationFirst: true,
      harnessBlocks: true,
      toolSchemas: 'full',
    });
    expect(applied).toEqual({
      prefetch: false,
      verificationFirst: false,
      harnessBlocks: false,
      toolSchemas: 'none',
    });
  });

  it('apply never widens a base gate', async () => {
    const taskVerdict = await classifier.classify(input('fix it'));
    const applied = gate.apply(taskVerdict, {
      prefetch: false,
      verificationFirst: false,
      harnessBlocks: false,
      toolSchemas: 'readonly',
    });
    expect(applied).toEqual({
      prefetch: false,
      verificationFirst: false,
      harnessBlocks: false,
      toolSchemas: 'readonly',
    });
  });

  it('apply picks readonly over full for question verdicts', async () => {
    const verdict = await classifier.classify(input('what is this?'));
    const applied = gate.apply(verdict, {
      prefetch: true,
      verificationFirst: true,
      harnessBlocks: true,
      toolSchemas: 'full',
    });
    expect(applied.toolSchemas).toBe('readonly');
  });
});
