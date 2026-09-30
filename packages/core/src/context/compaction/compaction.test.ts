/**
 * V31-CTX-02 — real compaction: model summary replaces placeholder,
 * user instructions preserved.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CompactionEngine,
  ModelSummaryProvider,
  TemplateSummaryProvider,
  ContextAssembler,
  validateToolCallPairIntegrity,
} from '../index';
import type { AgentMessage } from '../../types';

function hugeToolResult(turn: number, id: string): AgentMessage {
  return {
    role: 'tool',
    content: 'x'.repeat(20_000),
    toolCallId: id,
    name: 'read_file',
    metadata: { turn, toolName: 'read_file', type: 'tool_result' },
  };
}

function assistantCall(turn: number, id: string): AgentMessage {
  return {
    role: 'assistant',
    content: '',
    toolCalls: [{ id, name: 'read_file', arguments: { path: 'a' } }],
    metadata: { turn },
  };
}

describe('CTX-02 real compaction', () => {
  it('compactAsync uses model summary instead of placeholder', async () => {
    // Old unprotected turns (turn 1) + recent protected turns (turn 10).
    const messages: AgentMessage[] = [
      { role: 'system', content: 'sys', metadata: { protected: true } },
      { role: 'user', content: 'Please fix the parser bug', metadata: { turn: 1 } },
      assistantCall(1, 't1'),
      hugeToolResult(1, 't1'),
      { role: 'user', content: 'recent ask', metadata: { turn: 10 } },
      assistantCall(10, 't10'),
      hugeToolResult(10, 't10'),
    ];
    const provider = {
      summarize: vi.fn(async () => 'MODEL SUMMARY: user wants parser bug fixed.'),
    };
    const engine = new CompactionEngine(4_096, 6, provider);
    const result = await engine.compactAsync(messages, 'micro_summary');

    expect(provider.summarize).toHaveBeenCalledOnce();
    const summary = result.messages.find((m) => m.metadata?.type === 'micro_summary');
    expect(summary?.content).toContain('MODEL SUMMARY');
    expect(summary?.content).not.toContain('[compacted');
  });

  it('preserves user instructions across compaction', async () => {
    const messages: AgentMessage[] = [
      { role: 'system', content: 'sys', metadata: { protected: true } },
      { role: 'user', content: 'Do NOT touch auth.ts', metadata: { turn: 1 } },
      { role: 'user', content: 'Also keep tests green', metadata: { turn: 2 } },
      assistantCall(2, 't1'),
      hugeToolResult(2, 't1'),
      { role: 'user', content: 'latest', metadata: { turn: 20 } },
    ];
    const engine = new CompactionEngine(4_096, 1, new TemplateSummaryProvider());
    const result = await engine.compactAsync(messages, 'full');

    const contents = result.messages.map((m) => m.content);
    expect(contents).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Do NOT touch auth.ts'),
        expect.stringContaining('Also keep tests green'),
      ])
    );
    expect(validateToolCallPairIntegrity(result.messages).ok).toBe(true);
  });

  it('ModelSummaryProvider falls back to template when model returns nothing', async () => {
    const provider = new ModelSummaryProvider(async () => ({ content: '' }));
    const text = await provider.summarize(
      [{ role: 'user', content: 'keep this', metadata: { turn: 1 } }],
      256
    );
    expect(text).toContain('keep this');
  });

  it('ModelSummaryProvider falls back when model throws', async () => {
    const provider = new ModelSummaryProvider(async () => {
      throw new Error('boom');
    });
    const text = await provider.summarize(
      [{ role: 'user', content: 'remember X', metadata: { turn: 1 } }],
      256
    );
    expect(text).toContain('remember X');
  });

  it('sync compact still uses placeholders (backward compatible)', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'old', metadata: { turn: 1 } },
      hugeToolResult(1, 't1'),
      { role: 'user', content: 'recent', metadata: { turn: 10 } },
    ];
    const engine = new CompactionEngine(4_096);
    const result = engine.compact(messages, 'micro_summary');
    const summary = result.messages.find((m) => m.metadata?.type === 'micro_summary');
    expect(summary?.content).toContain('[compacted');
  });

  it('assembleAsync uses the summary provider when over budget', async () => {
    const assembler = new ContextAssembler(4_096);
    const big: AgentMessage[] = [
      { role: 'user', content: 'goal', metadata: { turn: 1 } },
      assistantCall(1, 't1'),
      hugeToolResult(1, 't1'),
      { role: 'user', content: 'recent', metadata: { turn: 20 } },
    ];
    const provider = { summarize: vi.fn(async () => 'ASYNC SUMMARY') };
    const result = await assembler.assembleAsync(
      {
        mode: 'agent',
        systemPrompt: 'You are a test agent.',
        messages: big,
        compactIfNeeded: true,
      },
      provider
    );
    expect(result.compacted).toBe(true);
    expect(result.messages.some((m) => m.content.includes('ASYNC SUMMARY'))).toBe(true);
  });
});
