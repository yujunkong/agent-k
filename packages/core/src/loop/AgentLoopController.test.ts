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

  it('emits phase transitions (V31-LOOP-01)', async () => {
    let turn = 0;
    const phases: Array<{ phase: string; turn: number; reason: string }> = [];

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
                  name: 'edit_file',
                  arguments: { path: 'src/a.ts' },
                },
              ],
            } satisfies ModelTurnResult;
          }
          return {
            content:
              '## Summary\n\nEdited src/a.ts and verified the change with read_lints; no remaining issues.',
          } satisfies ModelTurnResult;
        },
        executeTool: async ({ name }) => {
          if (name === 'read_lints') {
            return { success: true, data: { errors: [] } };
          }
          return { success: true, data: 'edited' };
        },
        onEvent: (e) => {
          if (e.type === 'phase') {
            phases.push({ phase: e.phase, turn: e.turn, reason: e.reason });
          }
        },
      },
      { maxTurns: 5, parallelTools: false, intentKind: 'task' }
    );

    const result = await controller.run({ prompt: 'Edit src/a.ts.' });

    expect(result.reason).toBe('completed');
    expect(phases.map((p) => p.phase)).toEqual(['execute', 'done']);
  });

  it('appends inline self-critique after clean edits, capped at maxPasses (V31-LOOP-02)', async () => {
    let turn = 0;
    const controller = new AgentLoopController(
      {
        runModel: async () => {
          turn++;
          if (turn <= 3) {
            return {
              content: '',
              toolCalls: [
                {
                  id: `c${turn}`,
                  name: 'edit_file',
                  arguments: { path: `src/f${turn}.ts` },
                },
              ],
            } satisfies ModelTurnResult;
          }
          return {
            content:
              '## Summary\n\nEdited src/f1.ts, src/f2.ts and src/f3.ts; each was verified with read_lints and no issues remain.',
          } satisfies ModelTurnResult;
        },
        executeTool: async ({ name }) => {
          if (name === 'read_lints') {
            return { success: true, data: { errors: [] } };
          }
          return { success: true, data: 'edited' };
        },
      },
      { maxTurns: 6, parallelTools: false, intentKind: 'task' }
    );

    const result = await controller.run({ prompt: 'Edit three files.' });
    const bodies = result.messages
      .filter((m) => m.role === 'tool' && m.name === 'edit_file')
      .map((m) => String(m.content));

    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toContain('<self_critique>');
    expect(bodies[1]).toContain('<self_critique>');
    expect(bodies[2]).not.toContain('<self_critique>');
  });

  it('emits self_critique events for Thought channel (V31-LOOP-02)', async () => {
    let turn = 0;
    const critiques: Array<{ turn: number; passes: number; text: string }> = [];
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
                  name: 'edit_file',
                  arguments: { path: 'src/a.ts' },
                },
              ],
            } satisfies ModelTurnResult;
          }
          return {
            content:
              '## Summary\n\nEdited src/a.ts; verified with read_lints; no issues remain.',
          } satisfies ModelTurnResult;
        },
        executeTool: async ({ name }) => {
          if (name === 'read_lints') {
            return { success: true, data: { errors: [] } };
          }
          return { success: true, data: 'edited' };
        },
        onEvent: (e) => {
          if (e.type === 'self_critique') {
            critiques.push({
              turn: e.turn,
              passes: e.passes,
              text: e.text,
            });
          }
        },
      },
      { maxTurns: 5, parallelTools: false, intentKind: 'task' }
    );

    await controller.run({ prompt: 'Edit src/a.ts.' });
    expect(critiques).toHaveLength(1);
    expect(critiques[0].passes).toBe(1);
    expect(critiques[0].text).toContain('<self_critique>');
  });

  it('skips phase inject for conversation intent (V31-LOOP-01)', async () => {
    let seenSystem = '';
    const phases: string[] = [];
    const controller = new AgentLoopController(
      {
        runModel: async ({ messages }) => {
          seenSystem = String(
            messages.find((m) => m.role === 'system')?.content ?? ''
          );
          return {
            content: 'Hello! How can I help you today?',
          } satisfies ModelTurnResult;
        },
        executeTool: async () => ({ success: true, data: null }),
        onEvent: (e) => {
          if (e.type === 'phase') phases.push(e.phase);
        },
      },
      { maxTurns: 3, intentKind: 'conversation' }
    );

    await controller.run({ prompt: 'hi' });
    expect(seenSystem).not.toContain('## Loop phase');
    expect(phases).toEqual([]);
  });
});
