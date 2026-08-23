/**
 * SHARED-002 — terminal run payload for chat.stream `terminal.run` events.
 */

export type TerminalRunPhase = 'start' | 'chunk' | 'end';

export type TerminalRunStream = 'stdout' | 'stderr';

export type TerminalRunStatus = 'running' | 'done' | 'error';

export interface TerminalRunPayload {
  id: string;
  phase: TerminalRunPhase;
  command?: string;
  description?: string;
  cwd?: string;
  chunk?: string;
  stream?: TerminalRunStream;
  exitCode?: number | null;
  error?: string;
  durationMs?: number;
  turn?: number;
  status?: TerminalRunStatus;
  /** Host tool call id — links TerminalRunCard to Ran timeline row */
  toolId?: string;
}
