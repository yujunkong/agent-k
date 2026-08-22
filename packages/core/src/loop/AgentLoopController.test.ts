/**
 * AGENT-001…004 — AgentLoopController unit tests with fake model/tool executor.
 */
import { describe, expect, it } from 'vitest';
import { AgentLoopController } from './AgentLoopController';
import type { AgentMessage, ModelTurnResult } from '../types';

describe('AgentLoopController (AGENT-001…004)', () => {
  it('runs a fake model that issues one tool call then final text', async () => {
    let turn = 0;
    const events: string[] = [];

    const controller = new AgentLoopController(
      {
        runModel: async ({ messages }) => {
          turn++;
          if (turn === 1) {
            return {
              content: 'Looking up the file.',
              toolCalls: [
                {
                  id: 'call_1',
                  name: 'read_file',
                  arguments: { path: 'src/index.ts' },
                },
              ],
            } satisfies ModelTurnResult;
          }
          // After tool result lands, return final answer.
          const hasTool = messages.some((m) => m.role === 'tool');
          expect(hasTool).toBe(true);
          return {
            content: '## Done\n\n- Read src/index.ts\n- Result looks good',
          } satisfies ModelTurnResult;
        },
        executeTool: async ({ name, args }) => {
          expect(name).toBe('read_file');
          expect(args.path).toBe('src/index.ts');
          return { success: true, data: 'export {};' };
        },
        onEvent: (e) => events.push(e.type),
      },
      { maxTurns: 5, parallelTools: false }
    );

    const result = await controller.run({ prompt: 'Read src/index.ts and summarize.' });

    expect(result.reason).toBe('completed');
    expect(result.turns).toBe(2);
    expect(result.content).toContain('Done');
    expect(result.messages.some((m) => m.role === 'tool')).toBe(true);
    expect(events).toContain('tool_start');
    expect(events).toContain('done');
  });

  it('enforces maxTurns (AGENT-008)', async () => {
    const controller = new AgentLoopController(
      {
        runModel: async () => ({
          content: 'again',
          toolCalls: [
            { id: 'c1', name: 'read_file', arguments: { path: 'a.ts' } },
          ],
        }),
        executeTool: async () => ({ success: true, data: 'ok' }),
      },
      { maxTurns: 2, parallelTools: false }
    );

    const result = await controller.run({ prompt: 'loop forever' });
    expect(result.reason).toBe('max_turns');
    expect(result.turns).toBe(2);
  });

  it('accumulates messages across multi-turn (AGENT-002)', async () => {
    const prior: AgentMessage[] = [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
    ];
    const controller = new AgentLoopController({
      runModel: async ({ messages }) => {
        expect(messages.some((m) => m.content === 'first question')).toBe(true);
        return { content: 'second answer with enough length for closing' };
      },
      executeTool: async () => ({ success: true, data: null }),
    });

    const result = await controller.run({
      prompt: 'follow up',
      messages: prior,
    });
    expect(result.reason).toBe('completed');
    expect(result.messages.length).toBeGreaterThanOrEqual(4);
  });

  it('nudges after blind read but still executes the tool (HARNESS-007)', async () => {
    let turn = 0;
    let executed = 0;
    const controller = new AgentLoopController(
      {
        runModel: async () => {
          turn++;
          if (turn === 1) {
            return {
              content: '',
              toolCalls: [
                {
                  id: 'c1',
                  name: 'read_file',
                  arguments: { path: 'crates/app/Cargo.toml' },
                },
              ],
            } satisfies ModelTurnResult;
          }
          return {
            content: '## Done\n\nWorkspace layout summarized after read.',
          } satisfies ModelTurnResult;
        },
        executeTool: async () => {
          executed += 1;
          return { success: true, data: '[workspace]' };
        },
      },
      { maxTurns: 5, parallelTools: false }
    );

    const result = await controller.run({ prompt: '프로젝트 구조 파악해줘' });
    expect(executed).toBe(1);
    expect(result.reason).toBe('completed');
    expect(
      result.messages.some(
        (m) =>
          m.role === 'system' && String(m.content).includes('prefer grep')
      )
    ).toBe(true);
  });
});
