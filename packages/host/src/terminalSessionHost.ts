/**
 * V31-TOOL-07 — session-scoped terminal run store.
 * run_terminal_cmd is synchronous; this records start/chunk/end so
 * terminal_output can read a prior run and process_list can enumerate runs.
 * Pure (no vscode) so it is unit-testable.
 */

export interface TerminalRunRecord {
  id: string;
  sessionId: string;
  command: string;
  description?: string;
  cwd?: string;
  status: 'running' | 'done' | 'error';
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
}

const MAX_RUNS_PER_SESSION = 50;
const MAX_BUFFER_CHARS = 80_000;

const runsBySession = new Map<string, TerminalRunRecord[]>();

function sessionRuns(sessionId: string): TerminalRunRecord[] {
  let runs = runsBySession.get(sessionId);
  if (!runs) {
    runs = [];
    runsBySession.set(sessionId, runs);
  }
  return runs;
}

function findRun(sessionId: string, id: string): TerminalRunRecord | undefined {
  return sessionRuns(sessionId).find((r) => r.id === id);
}

function appendCapped(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length > MAX_BUFFER_CHARS ? next.slice(-MAX_BUFFER_CHARS) : next;
}

export function recordTerminalStart(input: {
  sessionId: string;
  id: string;
  command: string;
  description?: string;
  cwd?: string;
}): void {
  const runs = sessionRuns(input.sessionId);
  const existing = runs.find((r) => r.id === input.id);
  if (existing) return;
  runs.push({
    id: input.id,
    sessionId: input.sessionId,
    command: input.command,
    description: input.description,
    cwd: input.cwd,
    status: 'running',
    stdout: '',
    stderr: '',
    exitCode: null,
    startedAt: Date.now(),
  });
  if (runs.length > MAX_RUNS_PER_SESSION) {
    runs.splice(0, runs.length - MAX_RUNS_PER_SESSION);
  }
}

export function recordTerminalChunk(
  sessionId: string,
  id: string,
  chunk: string,
  stream: 'stdout' | 'stderr',
): void {
  const run = findRun(sessionId, id);
  if (!run) return;
  if (stream === 'stdout') {
    run.stdout = appendCapped(run.stdout, chunk);
  } else {
    run.stderr = appendCapped(run.stderr, chunk);
  }
}

export function recordTerminalEnd(input: {
  sessionId: string;
  id: string;
  exitCode: number | null;
  status: 'done' | 'error';
  error?: string;
  cwd?: string;
}): void {
  const run = findRun(input.sessionId, input.id);
  if (!run) return;
  run.exitCode = input.exitCode;
  run.status = input.status;
  run.error = input.error;
  if (input.cwd != null) run.cwd = input.cwd;
  run.endedAt = Date.now();
  run.durationMs = run.endedAt - run.startedAt;
}

/**
 * Read the buffered output of a prior run. With no id, returns the latest run
 * for the session. Resolves `runId`/`id` from tool input.
 */
export function getTerminalOutput(
  sessionId: string,
  id?: string,
): {
  found: boolean;
  id?: string;
  command?: string;
  status?: TerminalRunRecord['status'];
  exitCode?: number | null;
  output: string;
  stdout?: string;
  stderr?: string;
  note?: string;
} {
  const runs = sessionRuns(sessionId);
  const run = id ? findRun(sessionId, id) : runs[runs.length - 1];
  if (!run) {
    return {
      found: false,
      output: '',
      note: id
        ? `No terminal run recorded for id "${id}".`
        : 'No terminal runs recorded this session.',
    };
  }
  const output = run.stdout + (run.stderr ? `\n${run.stderr}` : '');
  return {
    found: true,
    id: run.id,
    command: run.command,
    status: run.status,
    exitCode: run.exitCode,
    output,
    stdout: run.stdout,
    stderr: run.stderr,
  };
}

/** Enumerate agent-managed terminal runs (newest last). */
export function listProcesses(sessionId: string): Array<{
  id: string;
  command: string;
  status: TerminalRunRecord['status'];
  exitCode: number | null;
  startedAt: number;
  durationMs?: number;
}> {
  return sessionRuns(sessionId).map((r) => ({
    id: r.id,
    command: r.command,
    status: r.status,
    exitCode: r.exitCode,
    startedAt: r.startedAt,
    durationMs: r.durationMs,
  }));
}

/** Test/reset helper — clears one session or the whole store. */
export function resetTerminalRuns(sessionId?: string): void {
  if (sessionId) runsBySession.delete(sessionId);
  else runsBySession.clear();
}
