import { describe, expect, it } from 'vitest';
import { assignTerminalCardsToPhases } from './assignTerminalCards';
import type { TerminalRunPreview } from './types';

function run(
  partial: Partial<TerminalRunPreview> & Pick<TerminalRunPreview, 'id' | 'command'>
): TerminalRunPreview {
  return {
    status: 'done',
    stdout: '',
    stderr: '',
    turn: 1,
    ...partial
  };
}

describe('assignTerminalCardsToPhases', () => {
  it('pins each card to the phase that owns toolId (same turn, many Ran phases)', () => {
    const phases = [
      {
        id: 'phase_1',
        actions: [
          { id: 'call_a', kind: 'running', toolName: 'run_terminal_cmd', turn: 1 }
        ]
      },
      {
        id: 'phase_2',
        actions: [
          { id: 'call_b', kind: 'running', toolName: 'run_terminal_cmd', turn: 1 }
        ]
      },
      {
        id: 'phase_3',
        actions: [
          { id: 'call_c', kind: 'running', toolName: 'run_terminal_cmd', turn: 1 }
        ]
      }
    ];
    const terms = assignTerminalCardsToPhases(phases, [
      run({ id: 'term_a', command: 'echo a', toolId: 'call_a' }),
      run({ id: 'term_b', command: 'echo b', toolId: 'call_b' }),
      run({ id: 'term_c', command: 'echo c', toolId: 'call_c' })
    ]);

    expect(terms.get('phase_1')?.map((t) => t.id)).toEqual(['term_a']);
    expect(terms.get('phase_2')?.map((t) => t.id)).toEqual(['term_b']);
    expect(terms.get('phase_3')?.map((t) => t.id)).toEqual(['term_c']);
  });

  it('does not dump every card onto the first shell phase when toolIds differ', () => {
    const phases = [
      {
        id: 'phase_1',
        actions: [
          { id: 'call_a', kind: 'running', toolName: 'run_terminal_cmd', turn: 1 }
        ]
      },
      {
        id: 'phase_2',
        actions: [
          { id: 'call_b', kind: 'running', toolName: 'run_terminal_cmd', turn: 1 }
        ]
      }
    ];
    const terms = assignTerminalCardsToPhases(phases, [
      run({ id: 'term_b', command: 'npm test', toolId: 'call_b' }),
      run({ id: 'term_a', command: 'npm run build', toolId: 'call_a' })
    ]);

    expect(terms.get('phase_1')?.map((t) => t.id)).toEqual(['term_a']);
    expect(terms.get('phase_2')?.map((t) => t.id)).toEqual(['term_b']);
  });

  it('falls back to command match when toolId is missing', () => {
    const phases = [
      {
        id: 'phase_1',
        actions: [
          {
            id: 's1',
            kind: 'running',
            toolName: 'run_terminal_cmd',
            detail: 'ls -la',
            turn: 1
          }
        ]
      },
      {
        id: 'phase_2',
        actions: [
          {
            id: 's2',
            kind: 'running',
            toolName: 'run_terminal_cmd',
            detail: 'pwd',
            turn: 1
          }
        ]
      }
    ];
    const terms = assignTerminalCardsToPhases(phases, [
      run({ id: 'term_pwd', command: 'pwd' }),
      run({ id: 'term_ls', command: 'ls -la' })
    ]);

    expect(terms.get('phase_1')?.map((t) => t.id)).toEqual(['term_ls']);
    expect(terms.get('phase_2')?.map((t) => t.id)).toEqual(['term_pwd']);
  });
});
