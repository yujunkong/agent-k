/**
 * V31-CFG-01 — chatSendConfig tests (fake ConfigReader map).
 */

import { describe, expect, it } from 'vitest';
import type { HarnessConfig } from '@agent-k/core';
import type { IntentGates } from '@agent-k/shared';
import {
  FULL_INTENT_GATES,
  evaluateIntentGates,
  readHarnessConfig,
  readIntentGateEnabled,
  readMaxTurns,
  readStrictEditEnabled,
  readToolCallFallbackEnabled,
  resolveEffectiveHarnessFlags,
  type ConfigReader,
} from './chatSendConfig';

function reader(map: Record<string, unknown>): ConfigReader {
  return { get: (key) => map[key] };
}

describe('V31-CFG-01 readHarnessConfig', () => {
  it('reads sub-keys from the agent-k section', () => {
    const cfg = readHarnessConfig(
      reader({
        'harness.enabled': false,
        'harness.verificationFirst': false,
        'harness.prefetchEnabled': false,
        'harness.verificationMicroLoop': false,
      }),
    );
    expect(cfg).toEqual({
      enabled: false,
      verificationFirst: false,
      prefetchEnabled: false,
      verificationMicroLoop: false,
    });
  });

  it('defaults every flag to true when keys are missing', () => {
    expect(readHarnessConfig(reader({}))).toEqual({
      enabled: true,
      verificationFirst: true,
      prefetchEnabled: true,
      verificationMicroLoop: true,
    });
  });

  it('regression guard: double-prefixed key does NOT disable harness (ISSUE-06)', () => {
    const cfg = readHarnessConfig(
      reader({ 'agent-k.harness.enabled': false }),
    );
    expect(cfg.enabled).toBe(true);
  });
});

describe('V31-CFG-01 readMaxTurns', () => {
  it('reads agent-k.maxTurns', () => {
    expect(readMaxTurns(reader({ maxTurns: 42 }), 25)).toBe(42);
  });

  it('falls back when missing / not finite', () => {
    expect(readMaxTurns(reader({}), 25)).toBe(25);
    expect(readMaxTurns(reader({ maxTurns: 'abc' }), 25)).toBe(25);
  });

  it('clamps to 5..100', () => {
    expect(readMaxTurns(reader({ maxTurns: 1 }), 25)).toBe(5);
    expect(readMaxTurns(reader({ maxTurns: 500 }), 25)).toBe(100);
  });
});

describe('V31-CFG-01 readIntentGateEnabled', () => {
  it('defaults to true when missing', () => {
    expect(readIntentGateEnabled(reader({}))).toBe(true);
  });

  it('honors explicit false', () => {
    expect(readIntentGateEnabled(reader({ 'intentGate.enabled': false }))).toBe(
      false,
    );
  });

  it('treats non-false values as enabled', () => {
    expect(readIntentGateEnabled(reader({ 'intentGate.enabled': true }))).toBe(
      true,
    );
  });
});

describe('V31-TOOL-01/03 readToolCallFallbackEnabled / readStrictEditEnabled', () => {
  it('defaults both flags to true when keys are missing', () => {
    expect(readToolCallFallbackEnabled(reader({}))).toBe(true);
    expect(readStrictEditEnabled(reader({}))).toBe(true);
  });

  it('honors explicit false', () => {
    expect(
      readToolCallFallbackEnabled(reader({ 'toolCallFallback.enabled': false })),
    ).toBe(false);
    expect(readStrictEditEnabled(reader({ 'tools.strictEdit': false }))).toBe(
      false,
    );
  });

  it('treats non-false values as enabled', () => {
    expect(
      readToolCallFallbackEnabled(reader({ 'toolCallFallback.enabled': true })),
    ).toBe(true);
    expect(readStrictEditEnabled(reader({ 'tools.strictEdit': true }))).toBe(
      true,
    );
  });
});

const HARNESS_ON: HarnessConfig = {
  enabled: true,
  verificationFirst: true,
  prefetchEnabled: true,
  verificationMicroLoop: true,
};

const TASK_GATES: IntentGates = { ...FULL_INTENT_GATES };
const CONVERSATION_GATES: IntentGates = {
  prefetch: false,
  verificationFirst: false,
  harnessBlocks: false,
  toolSchemas: 'none',
};
const QUESTION_GATES: IntentGates = {
  prefetch: false,
  verificationFirst: false,
  harnessBlocks: false,
  toolSchemas: 'readonly',
};

describe('V31-INTENT-01 resolveEffectiveHarnessFlags', () => {
  it('harness off → all false even with task gates', () => {
    expect(
      resolveEffectiveHarnessFlags({ ...HARNESS_ON, enabled: false }, TASK_GATES),
    ).toEqual({
      verificationFirst: false,
      microLoop: false,
      prefetch: false,
      harnessBlocks: false,
    });
  });

  it('conversation gates → all false', () => {
    expect(
      resolveEffectiveHarnessFlags(HARNESS_ON, CONVERSATION_GATES),
    ).toEqual({
      verificationFirst: false,
      microLoop: false,
      prefetch: false,
      harnessBlocks: false,
    });
  });

  it('question gates → all false (readonly surface)', () => {
    expect(resolveEffectiveHarnessFlags(HARNESS_ON, QUESTION_GATES)).toEqual({
      verificationFirst: false,
      microLoop: false,
      prefetch: false,
      harnessBlocks: false,
    });
  });

  it('task gates → all true', () => {
    expect(resolveEffectiveHarnessFlags(HARNESS_ON, TASK_GATES)).toEqual({
      verificationFirst: true,
      microLoop: true,
      prefetch: true,
      harnessBlocks: true,
    });
  });

  it('harness.verificationMicroLoop=false + task → microLoop false only', () => {
    expect(
      resolveEffectiveHarnessFlags(
        { ...HARNESS_ON, verificationMicroLoop: false },
        TASK_GATES,
      ),
    ).toEqual({
      verificationFirst: true,
      microLoop: false,
      prefetch: true,
      harnessBlocks: true,
    });
  });
});

describe('V31-INTENT-01 evaluateIntentGates', () => {
  it('"hi" → conversation, enabled, toolSchemas none', async () => {
    const out = await evaluateIntentGates(reader({}), {
      userText: 'hi',
      mode: 'agent',
    });
    expect(out.enabled).toBe(true);
    expect(out.verdict.kind).toBe('conversation');
    expect(out.gates.toolSchemas).toBe('none');
    expect(out.gates.prefetch).toBe(false);
  });

  it('"fix the bug" → task with full gates', async () => {
    const out = await evaluateIntentGates(reader({}), {
      userText: 'fix the bug',
      mode: 'agent',
    });
    expect(out.verdict.kind).toBe('task');
    expect(out.gates).toEqual(FULL_INTENT_GATES);
  });

  it('intentGate.enabled: false → disabled, full gates', async () => {
    const out = await evaluateIntentGates(
      reader({ 'intentGate.enabled': false }),
      { userText: 'hi', mode: 'agent' },
    );
    expect(out.enabled).toBe(false);
    expect(out.gates).toEqual(FULL_INTENT_GATES);
    expect(out.gates.prefetch).toBe(true);
    expect(out.gates.verificationFirst).toBe(true);
    expect(out.gates.harnessBlocks).toBe(true);
    expect(out.gates.toolSchemas).toBe('full');
  });

  it('"what is this?" → question with readonly gates', async () => {
    const out = await evaluateIntentGates(reader({}), {
      userText: 'what is this?',
      mode: 'agent',
    });
    expect(out.verdict.kind).toBe('question');
    expect(out.gates.toolSchemas).toBe('readonly');
    expect(out.gates.harnessBlocks).toBe(false);
  });
});
