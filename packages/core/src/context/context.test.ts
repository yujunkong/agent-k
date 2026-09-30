/**
 * CTX-001…005 / AGENT-005…007 — context budget, assembler, compaction, workspace.
 */
import { describe, expect, it } from 'vitest';
import {
  CompactionEngine,
  ContextAssembler,
  WorkspaceContext,
  createContextBudget,
  estimateTokens,
  isOverBudget,
  repairToolCallPairs,
  resolveReadMaxLines,
  truncateToMaxLines,
  validateToolCallPairIntegrity,
} from './index';
import type { AgentMessage } from '../types';

describe('context domain (CTX-001…005)', () => {
  it('CTX-001 budget helpers', () => {
    const budget = createContextBudget(10_000);
    expect(budget.maxTokens).toBe(10_000);
    expect(budget.compactionThreshold).toBe(9000);
    expect(estimateTokens('abcd')).toBe(1);
    expect(isOverBudget(9000, budget)).toBe(true);
  });

  it('CTX-002 read max lines', () => {
    expect(resolveReadMaxLines(-1)).toBeGreaterThan(0);
    const t = truncateToMaxLines('a\nb\nc\nd', 2);
    expect(t.truncated).toBe(true);
    expect(t.text.split('\n').length).toBeLessThanOrEqual(3);
  });

  it('CTX-003 / AGENT-005 ContextAssembler', () => {
    const assembler = new ContextAssembler(8_000);
    const result = assembler.assemble({
      mode: 'agent',
      systemPrompt: 'You are a test agent.',
      messages: [{ role: 'user', content: 'hello' }],
      compactIfNeeded: false,
    });
    expect(result.messages[0]?.role).toBe('system');
    expect(result.messages.some((m) => m.role === 'user')).toBe(true);
  });

  it('HARNESS-005 injects PROJECT RULES into protected system slot', () => {
    const assembler = new ContextAssembler(8_000);
    const result = assembler.assemble({
      mode: 'agent',
      systemPrompt: 'You are a test agent.',
      messages: [{ role: 'user', content: 'hello' }],
      projectRules: 'Always write tests.',
      compactIfNeeded: false,
    });
    const system = result.messages.find((m) => m.role === 'system');
    expect(system?.content).toContain('## PROJECT RULES');
    expect(system?.content).toContain('Always write tests.');
    expect(system?.metadata?.protected).toBe(true);
  });

  it('PLAN-009 injects APPROVED PLAN before PROJECT RULES', () => {
    const assembler = new ContextAssembler(8_000);
    const result = assembler.assemble({
      mode: 'agent',
      systemPrompt: 'You are a test agent.',
      messages: [{ role: 'user', content: 'hello' }],
      approvedPlanBlock: '## APPROVED PLAN\n\nGoal: ship',
      projectRules: 'Always write tests.',
      compactIfNeeded: false,
    });
    const system = String(result.messages.find((m) => m.role === 'system')?.content);
    const planIdx = system.indexOf('## APPROVED PLAN');
    const rulesIdx = system.indexOf('## PROJECT RULES');
    expect(planIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(planIdx);
  });

  it('HARNESS-002 injects verification-first protocol by default', () => {
    const assembler = new ContextAssembler(8_000);
    const result = assembler.assemble({
      mode: 'agent',
      systemPrompt: 'You are a test agent.',
      messages: [{ role: 'user', content: 'hello' }],
      compactIfNeeded: false,
    });
    const system = String(result.messages.find((m) => m.role === 'system')?.content);
    expect(system).toContain('Verification-First Protocol');
  });

  it('AGENT-007 preserves tool_call pairs during compaction', () => {
    const messages: AgentMessage[] = [
      { role: 'system', content: 'sys', metadata: { protected: true } },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 't1', name: 'read_file', arguments: { path: 'a' } }],
        metadata: { turn: 1 },
      },
      {
        role: 'tool',
        content: 'file contents',
        toolCallId: 't1',
        name: 'read_file',
        metadata: { turn: 1, type: 'tool_result' },
      },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'orphan', name: 'grep', arguments: { pattern: 'x' } }],
        metadata: { turn: 2 },
      },
      // orphan tool result with no matching assistant call
      {
        role: 'tool',
        content: 'orphan result',
        toolCallId: 'missing',
        name: 'grep',
        metadata: { turn: 2 },
      },
    ];

    const repaired = repairToolCallPairs(messages);
    const integrity = validateToolCallPairIntegrity(repaired);
    expect(integrity.ok).toBe(true);

    const engine = new CompactionEngine(4_096);
    const compacted = engine.compact(messages, 'drop');
    expect(validateToolCallPairIntegrity(compacted.messages).ok).toBe(true);
  });

  it('CTX-005 WorkspaceContext stub', () => {
    const ws = new WorkspaceContext();
    ws.setRoots([{ name: 'root', path: '/tmp/proj' }]);
    ws.setOpenFiles(['a.ts', 'b.ts']);
    ws.setActiveFile('a.ts');
    const block = ws.toPromptBlock();
    expect(block).toContain('/tmp/proj');
    expect(block).toContain('a.ts');
  });

  it('V31-CTX-05 truncation never cuts PROJECT RULES', () => {
    const assembler = new ContextAssembler(4_096);
    // Base prompt far larger than the 15% system cap (4096*0.15*4 ≈ 2457 chars).
    const longPrompt = 'P'.repeat(8_000);
    const result = assembler.assemble({
      mode: 'agent',
      systemPrompt: longPrompt,
      messages: [{ role: 'user', content: 'hello' }],
      projectRules: 'Always keep the public API stable.',
      compactIfNeeded: false,
    });
    const system = String(result.messages.find((m) => m.role === 'system')?.content);
    expect(result.truncated).toBe(true);
    expect(system).toContain('Always keep the public API stable.');
    expect(system).toContain('## PROJECT RULES');
  });

  it('V31-CTX-05 truncation never cuts the APPROVED PLAN', () => {
    const assembler = new ContextAssembler(4_096);
    const result = assembler.assemble({
      mode: 'agent',
      systemPrompt: 'S'.repeat(8_000),
      messages: [{ role: 'user', content: 'hello' }],
      approvedPlanBlock: '## APPROVED PLAN\n\nGoal: ship v3.1',
      compactIfNeeded: false,
    });
    const system = String(result.messages.find((m) => m.role === 'system')?.content);
    expect(system).toContain('Goal: ship v3.1');
  });

  it('V31-CTX-05 injects workspace context into the system slot', () => {
    const assembler = new ContextAssembler(8_000);
    const ws = new WorkspaceContext();
    ws.setRoots([{ name: 'proj', path: '/repo/proj' }]);
    ws.setOpenFiles(['src/index.ts']);
    ws.setActiveFile('src/index.ts');
    const result = assembler.assemble({
      mode: 'agent',
      systemPrompt: 'You are a test agent.',
      messages: [{ role: 'user', content: 'hello' }],
      workspace: ws,
      compactIfNeeded: false,
    });
    const system = String(result.messages.find((m) => m.role === 'system')?.content);
    expect(system).toContain('## Workspace');
    expect(system).toContain('/repo/proj');
    expect(system).toContain('src/index.ts');
  });
});
