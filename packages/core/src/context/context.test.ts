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
});
