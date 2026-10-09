/**
 * V31-INTENT-01 — heuristic classifier + IntentGate.apply AND semantics.
 */

import { describe, expect, it } from 'vitest';
import {
  HeuristicIntentClassifier,
  IntentGate,
} from './index';

const classifier = new HeuristicIntentClassifier();
const gate = new IntentGate(classifier);

describe('V31-INTENT-01 HeuristicIntentClassifier', () => {
  it('"hi" → conversation, toolSchemas none', () => {
    const v = classifier.classify({ userText: 'hi', mode: 'agent' });
    expect(v.kind).toBe('conversation');
    expect(v.gates.prefetch).toBe(false);
    expect(v.gates.verificationFirst).toBe(false);
    expect(v.gates.harnessBlocks).toBe(false);
    expect(v.gates.toolSchemas).toBe('none');
  });

  it('"안녕" / "thanks" → conversation', () => {
    expect(classifier.classify({ userText: '안녕', mode: 'agent' }).kind).toBe(
      'conversation',
    );
    expect(
      classifier.classify({ userText: 'thanks!', mode: 'agent' }).kind,
    ).toBe('conversation');
  });

  it('"고치지 마" → conversation (no-edit)', () => {
    const v = classifier.classify({ userText: '고치지 마', mode: 'agent' });
    expect(v.kind).toBe('conversation');
    expect(v.gates.toolSchemas).toBe('none');
    expect(v.reason).toMatch(/no-edit/i);
  });

  it('"don\'t fix" → conversation (no-edit)', () => {
    const v = classifier.classify({ userText: "don't fix", mode: 'agent' });
    expect(v.kind).toBe('conversation');
    expect(v.gates.toolSchemas).toBe('none');
  });

  it('question without action verb → readonly', () => {
    const v = classifier.classify({
      userText: 'What does PrefetchEngine do?',
      mode: 'agent',
    });
    expect(v.kind).toBe('question');
    expect(v.gates.toolSchemas).toBe('readonly');
    expect(v.gates.prefetch).toBe(false);
  });

  it('question + action verb → task', () => {
    const v = classifier.classify({
      userText: 'How do I fix the login bug?',
      mode: 'agent',
    });
    expect(v.kind).toBe('task');
    expect(v.gates.toolSchemas).toBe('full');
  });

  it('default / task prose → full gates', () => {
    const v = classifier.classify({
      userText: 'Add logging to chatSend',
      mode: 'agent',
    });
    expect(v.kind).toBe('task');
    expect(v.gates).toEqual({
      prefetch: true,
      verificationFirst: true,
      harnessBlocks: true,
      toolSchemas: 'full',
    });
  });

  it('inline edit forces task even for "hi"', () => {
    const v = classifier.classify({
      userText: 'hi',
      mode: 'agent',
      hasInlineEdit: true,
    });
    expect(v.kind).toBe('task');
    expect(v.gates.toolSchemas).toBe('full');
  });
});

describe('V31-INTENT-01 IntentGate.apply', () => {
  it('AND prefetch/verify with harness base', async () => {
    const verdict = await gate.evaluate({ userText: 'hi', mode: 'agent' });
    const applied = gate.apply(verdict, {
      prefetch: true,
      verificationFirst: true,
      harnessBlocks: true,
      toolSchemas: 'full',
    });
    expect(applied.prefetch).toBe(false);
    expect(applied.verificationFirst).toBe(false);
    expect(applied.harnessBlocks).toBe(false);
    expect(applied.toolSchemas).toBe('none');
  });

  it('keeps more restrictive toolSchemas from base', async () => {
    const verdict = await gate.evaluate({
      userText: 'Add a feature',
      mode: 'agent',
    });
    const applied = gate.apply(verdict, {
      prefetch: true,
      verificationFirst: true,
      harnessBlocks: true,
      toolSchemas: 'readonly',
    });
    expect(applied.toolSchemas).toBe('readonly');
  });

  it('harness-off base stays off even for task', async () => {
    const verdict = await gate.evaluate({
      userText: 'Implement X',
      mode: 'agent',
    });
    const applied = gate.apply(verdict, {
      prefetch: false,
      verificationFirst: false,
      harnessBlocks: false,
      toolSchemas: 'full',
    });
    expect(applied.prefetch).toBe(false);
    expect(applied.verificationFirst).toBe(false);
    expect(applied.harnessBlocks).toBe(false);
    expect(applied.toolSchemas).toBe('full');
  });
});
