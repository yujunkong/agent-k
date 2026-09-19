/**
 * Phase 10 — 통합 검증 (Master §38)
 * INT-001 Provider → Agent → Tool → Context 체인
 * INT-003 Auto Mode → Agent/Plan/Debug/Ask 전환
 * INT-006 Provider failure → fallback/routing
 * INT-008 Cost/Telemetry 동작
 * INT-009 Hooks + Verification micro-loop
 */
import { describe, it, expect } from 'vitest';
import { modeRegistry } from '../mode/ModeRegistry';
import { ContextAssembler } from '../context/ContextAssembler';
import { routeByHeuristics } from '../harness/RoutingHeuristics';
import { inferTierFromModelId } from '../harness/ModelTiers';
import { CostTracker } from '../telemetry/CostTracker';
import { SessionUsageTracker } from '../telemetry/StatusBarCost';
import { TelemetryCollector } from '../telemetry/TelemetryCollector';
import { HooksSystem, runVerificationMicroLoop } from '@agent-k/safety';

describe('INT-001 Provider → Agent → Tool → Context 체인', () => {
  it('mode config → context assembly chain', () => {
    // 1. mode config (HOST-002 bridge surface)
    const agentConfig = modeRegistry.getModeConfig('agent');
    expect(agentConfig.systemPrompt.length).toBeGreaterThan(0);
    expect(agentConfig.maxTurns).toBeGreaterThan(0);
    expect(agentConfig.allowedTools.length).toBeGreaterThan(0);

    // 2. context assembly (CTX-003 / AGENT-005) — protected system slot
    const assembler = new ContextAssembler();
    const result = assembler.assemble({
      mode: 'agent',
      systemPrompt: agentConfig.systemPrompt,
      messages: [{ role: 'user', content: 'fix the bug' }],
      verificationFirst: true,
      harnessEnabled: true,
    });
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0].role).toBe('system');
    expect(result.usedTokens).toBeGreaterThan(0);
  });

  it('mode/tool consistency — ask mode excludes write tools', () => {
    const askConfig = modeRegistry.getModeConfig('ask');
    expect(askConfig.allowedTools.every((t) => !t.startsWith('edit_') && !t.startsWith('write_'))).toBe(true);
    expect(modeRegistry.isToolAllowed('ask', 'edit_file')).toBe(false);
    expect(modeRegistry.isToolAllowed('agent', 'edit_file')).toBe(true);
  });
});

describe('INT-003 Auto Mode → Agent/Plan/Debug/Ask 전환', () => {
  it('registry exposes all modes with distinct prompts', () => {
    const modes = modeRegistry.listModes();
    expect(modes.length).toBeGreaterThanOrEqual(4);
    const prompts = new Set(modes.map((m) => m.systemPrompt));
    expect(prompts.size).toBe(modes.length);
  });

  it('mcp tool allowance differs per mode (only agent/debug)', () => {
    expect(modeRegistry.isToolAllowed('agent', 'mcp_tool')).toBe(true);
    expect(modeRegistry.isToolAllowed('debug', 'mcp_tool')).toBe(true);
    expect(modeRegistry.isToolAllowed('ask', 'mcp_tool')).toBe(false);
    expect(modeRegistry.isToolAllowed('plan', 'mcp_tool')).toBe(false);
  });
});

describe('INT-006 Provider failure → fallback/routing', () => {
  it('routing heuristics degrade tier on consecutive failures', () => {
    const healthy = routeByHeuristics({ currentTier: 'A', consecutiveFailures: 0 });
    const degraded = routeByHeuristics({ currentTier: 'A', consecutiveFailures: 2 });
    expect(healthy.tier).toBe('A');
    expect(degraded.tier).toBe('B');
    expect(degraded.reason).toBe('consecutive_failures_2x');
  });

  it('tier inference falls back for unknown model ids', () => {
    expect(inferTierFromModelId('gpt-4o')).toBe('B');
    expect(inferTierFromModelId('unknown-model-xyz')).toBe('A');
  });
});

describe('INT-008 Cost/Telemetry 동작', () => {
  it('usage → tracker → status bar → telemetry summary chain', () => {
    const tracker = new SessionUsageTracker();
    const collector = new TelemetryCollector();

    // simulate two turns with usage
    tracker.recordUsage(1000, 500);
    collector.recordToolCall('read_file', 'read', 120, true);
    tracker.recordUsage(2000, 800);
    collector.recordToolCall('read_file', 'read', 180, true);

    const totals = tracker.getTotals();
    expect(totals.totalTokens).toBe(4300);
    expect(totals.estimatedCostUsd).toBeGreaterThan(0);
    expect(tracker.formatStatusBar()).toContain('tok');

    const summary = collector.getSummary();
    expect(summary.totalTurns).toBe(2);
    expect(summary.successRate).toBe(1);
  });

  it('budget gate trips on exceeded usage', () => {
    const budget = new CostTracker({ dailyTokenBudget: 100, monthlyTokenBudget: 100, warningThreshold: 0.5 });
    budget.recordTokenUsage(150);
    expect(budget.isOverBudget()).toBe(true);
    expect(budget.getWarningMessage()).toContain('exceeded');
  });
});

describe('INT-009 Hooks + Verification micro-loop', () => {
  it('blocking beforeTool hook short-circuits with explicit error', async () => {
    const hooks = new HooksSystem();
    hooks.registerBeforeTool(() => ({
      ok: false,
      error: { code: 'DENIED', message: 'tool denied by hook' },
    }));

    const result = await hooks.runBeforeTool({ toolName: 'edit_file', turnNumber: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DENIED');
    }
    expect(hooks.getLogs()).toHaveLength(1);
  });

  it('verification micro-loop re-checks after fix and passes', async () => {
    let healthy = false;
    let fixes = 0;
    const result = await runVerificationMicroLoop({
      check: () => healthy,
      fix: () => {
        fixes++;
        healthy = fixes >= 1;
      },
      maxFixAttempts: 2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.fixAttempts).toBe(1);
      expect(result.value.checkCount).toBe(2);
    }
  });

  it('verification micro-loop stops at maxFixAttempts', async () => {
    // 계약: 시도 소진 시 ok: false + VERIFICATION_FAILED
    const result = await runVerificationMicroLoop({
      check: () => false,
      maxFixAttempts: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VERIFICATION_FAILED');
    }
  });
});
