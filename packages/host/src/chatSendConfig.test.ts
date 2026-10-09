/**
 * V31-INTENT-01 / V31-CFG-01 — config readers.
 */

import { describe, expect, it } from 'vitest';
import {
  readIntentGateEnabled,
  readToolCallFallbackEnabled,
  resolveEffectiveHarnessFlags,
  resolveHarnessSubKeys,
  type ConfigReader,
} from './chatSendConfig';

function reader(map: Record<string, unknown>): ConfigReader {
  return {
    get: <T>(key: string) => map[key] as T | undefined,
  };
}

describe('V31-INTENT-01 readIntentGateEnabled', () => {
  it('defaults true', () => {
    expect(readIntentGateEnabled(reader({}))).toBe(true);
  });

  it('opt-out when false', () => {
    expect(
      readIntentGateEnabled(reader({ 'intentGate.enabled': false })),
    ).toBe(false);
  });
});

describe('V31-CFG-01 harness sub-keys', () => {
  it('reads harness.* without double agent-k prefix', () => {
    const h = resolveHarnessSubKeys(
      reader({
        'harness.enabled': true,
        'harness.prefetchEnabled': false,
        'harness.verificationFirst': true,
        'harness.verificationMicroLoop': false,
      }),
    );
    expect(h.enabled).toBe(true);
    expect(h.prefetchEnabled).toBe(false);
    expect(h.verificationFirst).toBe(true);
    expect(h.verificationMicroLoop).toBe(false);
  });

  it('master off forces all effective flags off', () => {
    const eff = resolveEffectiveHarnessFlags(
      reader({
        'harness.enabled': false,
        'harness.prefetchEnabled': true,
        'harness.verificationFirst': true,
        'harness.verificationMicroLoop': true,
      }),
    );
    expect(eff.harnessEnabled).toBe(false);
    expect(eff.harnessPrefetch).toBe(false);
    expect(eff.harnessVerifyFirst).toBe(false);
    expect(eff.harnessMicroLoop).toBe(false);
  });
});

describe('V31-TOOL-01 readToolCallFallbackEnabled', () => {
  it('defaults true when key is missing', () => {
    expect(readToolCallFallbackEnabled(reader({}))).toBe(true);
  });

  it('honors explicit false', () => {
    expect(
      readToolCallFallbackEnabled(
        reader({ 'toolCallFallback.enabled': false }),
      ),
    ).toBe(false);
  });
});
