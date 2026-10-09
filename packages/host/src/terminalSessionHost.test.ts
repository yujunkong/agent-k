/**
 * V31-TOOL-07 — terminalSessionHost store tests.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getTerminalOutput,
  listProcesses,
  recordTerminalChunk,
  recordTerminalEnd,
  recordTerminalStart,
  resetTerminalRuns,
} from './terminalSessionHost';

describe('V31-TOOL-07 terminalSessionHost', () => {
  beforeEach(() => resetTerminalRuns());

  it('records a run end-to-end and reads it back by id', () => {
    recordTerminalStart({
      sessionId: 's1',
      id: 'term_a',
      command: 'echo hi',
    });
    recordTerminalChunk('s1', 'term_a', 'hi\n', 'stdout');
    recordTerminalChunk('s1', 'term_a', 'warn\n', 'stderr');
    recordTerminalEnd({
      sessionId: 's1',
      id: 'term_a',
      exitCode: 0,
      status: 'done',
    });

    const out = getTerminalOutput('s1', 'term_a');
    expect(out.found).toBe(true);
    expect(out.stdout).toBe('hi\n');
    expect(out.stderr).toBe('warn\n');
    expect(out.output).toContain('hi');
    expect(out.status).toBe('done');
    expect(out.exitCode).toBe(0);
  });

  it('returns the latest run when no id is given', () => {
    recordTerminalStart({ sessionId: 's1', id: 'r1', command: 'a' });
    recordTerminalEnd({ sessionId: 's1', id: 'r1', exitCode: 0, status: 'done' });
    recordTerminalStart({ sessionId: 's1', id: 'r2', command: 'b' });
    recordTerminalEnd({ sessionId: 's1', id: 'r2', exitCode: 1, status: 'error' });

    const out = getTerminalOutput('s1');
    expect(out.id).toBe('r2');
    expect(out.command).toBe('b');
  });

  it('reports not-found for an unknown id', () => {
    const out = getTerminalOutput('s1', 'nope');
    expect(out.found).toBe(false);
    expect(out.note).toContain('nope');
  });

  it('isolates sessions', () => {
    recordTerminalStart({ sessionId: 's1', id: 'a', command: 'a' });
    recordTerminalStart({ sessionId: 's2', id: 'b', command: 'b' });
    expect(listProcesses('s1').map((p) => p.id)).toEqual(['a']);
    expect(listProcesses('s2').map((p) => p.id)).toEqual(['b']);
  });

  it('lists runs with status and duration', () => {
    recordTerminalStart({ sessionId: 's1', id: 'a', command: 'echo' });
    recordTerminalEnd({ sessionId: 's1', id: 'a', exitCode: 0, status: 'done' });
    const [p] = listProcesses('s1');
    expect(p.command).toBe('echo');
    expect(p.status).toBe('done');
    expect(typeof p.durationMs).toBe('number');
  });
});
