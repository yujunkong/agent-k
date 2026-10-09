/**
 * V31-INTENT-01 / V31-CFG-01 / Phase C — config readers.
 */

import { describe, expect, it } from 'vitest';
import {
  readDeltaAwareRetryEnabled,
  readDoomLoopOptions,
  readIntentGateEnabled,
  readPermissionRecoveryEnabled,
  readRealCompactionEnabled,
  readSessionTranscriptEnabled,
  readStrictEditEnabled,
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

describe('V31-TOOL-03 readStrictEditEnabled', () => {
  it('defaults true when key is missing', () => {
    expect(readStrictEditEnabled(reader({}))).toBe(true);
  });

  it('honors explicit false', () => {
    expect(
      readStrictEditEnabled(reader({ 'tools.strictEdit': false })),
    ).toBe(false);
  });
});

describe('V31-CTX-02 readRealCompactionEnabled', () => {
  it('defaults to false when the key is missing', () => {
    expect(readRealCompactionEnabled(reader({}))).toBe(false);
  });

  it('honors explicit true', () => {
    expect(
      readRealCompactionEnabled(reader({ 'compaction.realSummary': true })),
    ).toBe(true);
  });
});

describe('V31-CTX-01 readSessionTranscriptEnabled', () => {
  it('defaults to false when the key is missing', () => {
    expect(readSessionTranscriptEnabled(reader({}))).toBe(false);
  });

  it('honors explicit true', () => {
    expect(
      readSessionTranscriptEnabled(
        reader({ 'sessionTranscript.enabled': true }),
      ),
    ).toBe(true);
  });
});

describe('V31-RETRY-04 readPermissionRecoveryEnabled', () => {
  it('defaults to false when the key is missing', () => {
    expect(readPermissionRecoveryEnabled(reader({}))).toBe(false);
  });

  it('honors explicit true', () => {
    expect(
      readPermissionRecoveryEnabled(
        reader({ 'retry.permissionRecovery': true }),
      ),
    ).toBe(true);
  });
});

describe('V31-RETRY-02 readDeltaAwareRetryEnabled', () => {
  it('defaults to false when the key is missing', () => {
    expect(readDeltaAwareRetryEnabled(reader({}))).toBe(false);
  });

  it('honors explicit true', () => {
    expect(
      readDeltaAwareRetryEnabled(reader({ 'retry.deltaAware': true })),
    ).toBe(true);
  });
});

describe('V31-RETRY-03 readDoomLoopOptions', () => {
  it('returns undefined when neither option is set', () => {
    expect(readDoomLoopOptions(reader({}))).toBeUndefined();
  });

  it('reads each option independently', () => {
    expect(
      readDoomLoopOptions(reader({ 'retry.doomLoop.detectAlternation': true })),
    ).toEqual({ detectAlternation: true, ignoreArgsOnSameError: false });
    expect(
      readDoomLoopOptions(
        reader({ 'retry.doomLoop.ignoreArgsOnSameError': true }),
      ),
    ).toEqual({ detectAlternation: false, ignoreArgsOnSameError: true });
  });

  it('returns both when both are set', () => {
    expect(
      readDoomLoopOptions(
        reader({
          'retry.doomLoop.detectAlternation': true,
          'retry.doomLoop.ignoreArgsOnSameError': true,
        }),
      ),
    ).toEqual({ detectAlternation: true, ignoreArgsOnSameError: true });
  });
});
