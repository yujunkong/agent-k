/**
 * TOOL-006 TerminalTool — spawn shell with timeout; safety deny check.
 */

import { spawn } from 'node:child_process';
import { isTerminalCommandDenied } from '@agent-k/safety';
import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 32_768;

export function runTerminalCommand(options: {
  command: string;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  const shellArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', options.command]
      : ['-c', options.command];

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(shell, shellArgs, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      const truncated =
        stdout.length > MAX_OUTPUT || stderr.length > MAX_OUTPUT;
      resolve({
        stdout: stdout.slice(-MAX_OUTPUT),
        stderr: stderr.slice(-MAX_OUTPUT),
        exitCode,
        timedOut,
        truncated,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 1000).unref?.();
    }, timeoutMs);

    const onAbort = () => {
      timedOut = false;
      child.kill('SIGTERM');
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('error', (err) => {
      stderr += err.message;
      finish(-1);
    });
    child.on('close', (code) => finish(code));
  });
}

export const terminalTool: ToolDefinition = {
  name: 'run_terminal_cmd',
  description: 'Run a shell command in the workspace with timeout and deny checks.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run' },
      timeoutMs: { type: 'number', description: 'Timeout in ms (default 60000)' },
      cwd: { type: 'string', description: 'Optional relative cwd under workspace' },
    },
    required: ['command'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      stdout: { type: 'string' },
      stderr: { type: 'string' },
      exitCode: { type: 'number' },
      timedOut: { type: 'boolean' },
    },
  },
  permissionHint: 'terminal',
  timeoutMs: 120_000,
  cancelSupported: true,
  timelineEventType: 'running',
  modeAllowlist: ['agent', 'debug', 'plan'],
  category: 'terminal',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const command = String(input.command ?? '').trim();
      if (!command) {
        return { success: false, error: 'run_terminal_cmd requires command' };
      }
      if (isTerminalCommandDenied(command)) {
        return {
          success: false,
          error: `Command denied by safety policy: ${command.slice(0, 80)}`,
          denied: true,
        };
      }

      let cwd = ctx.workspaceRoot;
      if (input.cwd) {
        const { resolveWorkspacePath } = await import('../pathUtils');
        const resolved = resolveWorkspacePath(ctx.workspaceRoot, String(input.cwd));
        if ('error' in resolved) {
          return { success: false, error: resolved.error, denied: true };
        }
        cwd = resolved.abs;
      }

      const result = await runTerminalCommand({
        command,
        cwd,
        timeoutMs: Number(input.timeoutMs) || DEFAULT_TIMEOUT_MS,
        signal: ctx.signal,
      });

      return {
        success: result.exitCode === 0 && !result.timedOut,
        data: result,
        error: result.timedOut
          ? 'Command timed out'
          : result.exitCode === 0
            ? undefined
            : `Exit code ${result.exitCode}`,
        truncated: result.truncated,
      };
    });
  },
};
