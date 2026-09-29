/**
 * V31-CFG-01 — chatSendConfig tests (fake ConfigReader map).
 */

import { describe, expect, it } from 'vitest';
import {
  readHarnessConfig,
  readIntentGateEnabled,
  readMaxTurns,
  readStrictEditEnabled,
  readToolCallFallbackEnabled,
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
