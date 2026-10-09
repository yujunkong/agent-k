/**
 * V31-INTENT-01 — host gate combination proxy (R1/R2).
 * Comment: pure IntentGate + ToolRegistry — no vscode webview.
 */

import { describe, expect, it } from 'vitest';
import {
  HeuristicIntentClassifier,
  IntentGate,
} from '@agent-k/core';
import { registerBuiltinTools, ToolRegistry } from '@agent-k/tools';
import {
  resolveEffectiveHarnessFlags,
  type ConfigReader,
} from './chatSendConfig';

function reader(map: Record<string, unknown>): ConfigReader {
  return { get: <T>(key: string) => map[key] as T | undefined };
}

async function pipeline(userText: string, cfgMap: Record<string, unknown>) {
  const cfg = reader(cfgMap);
  const harness = resolveEffectiveHarnessFlags(cfg);
  const gate = new IntentGate(new HeuristicIntentClassifier());
  const verdict = await gate.evaluate({
    userText,
    mode: 'agent',
  });
  const gates = gate.apply(verdict, {
    prefetch: harness.harnessPrefetch,
    verificationFirst: harness.harnessVerifyFirst,
    harnessBlocks: harness.harnessEnabled,
    toolSchemas: 'full',
  });
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  const schemas =
    gates.toolSchemas === 'none'
      ? []
      : registry.getSchemas('agent', {
          harnessEnabled: false,
          intentKind:
            gates.toolSchemas === 'readonly' ? 'question' : verdict.kind,
        });
  return {
    kind: verdict.kind,
    gates,
    schemaCount: schemas.length,
    microLoop: harness.harnessMicroLoop && gates.verificationFirst,
  };
}

describe('V31-INTENT-01 host intent pipeline', () => {
  it('R1: "hi" → no tools, no prefetch, no verify, microLoop off', async () => {
    const out = await pipeline('hi', {});
    expect(out.kind).toBe('conversation');
    expect(out.schemaCount).toBe(0);
    expect(out.gates.prefetch).toBe(false);
    expect(out.gates.verificationFirst).toBe(false);
    expect(out.microLoop).toBe(false);
  });

  it('R1: "안녕" → same conversation gates', async () => {
    const out = await pipeline('안녕', {});
    expect(out.kind).toBe('conversation');
    expect(out.schemaCount).toBe(0);
  });

  it('R2: harness master off → prefetch/verify/micro off even for task', async () => {
    const out = await pipeline('Implement login fix', {
      'harness.enabled': false,
    });
    expect(out.kind).toBe('task');
    expect(out.gates.prefetch).toBe(false);
    expect(out.gates.verificationFirst).toBe(false);
    expect(out.microLoop).toBe(false);
    expect(out.schemaCount).toBeGreaterThan(0);
  });

  it('task + harness on → full pipeline surfaces', async () => {
    const out = await pipeline('Add logging to chatSend', {});
    expect(out.kind).toBe('task');
    expect(out.gates.prefetch).toBe(true);
    expect(out.gates.verificationFirst).toBe(true);
    expect(out.microLoop).toBe(true);
    expect(out.schemaCount).toBeGreaterThan(0);
  });

  it('question → readonly schemas (read_file yes, edit_file no)', async () => {
    const out = await pipeline('What does PrefetchEngine do?', {});
    expect(out.kind).toBe('question');
    expect(out.gates.toolSchemas).toBe('readonly');
    expect(out.gates.prefetch).toBe(false);
  });
});
