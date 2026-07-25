/**
 * TerminalTool - 터미널 명령 실행 (C2-T09/C2-T10)
 * 
 * allowlist: git, npm test, pytest, cargo test 등
 * 출력 캡처: stdout+stderr, 끝 32KB, exit code 포함
 */
import { execSync, exec, ChildProcess } from 'child_process';

export interface TerminalResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

const ALLOWLIST_PREFIXES = [
  'git', 'npm', 'npx', 'yarn', 'pnpm',
  'node', 'tsc', 'esbuild', 'vite',
  'python', 'python3', 'pytest',
  'cargo', 'rustc',
  'go', 'gofmt',
  'make', 'cmake',
  'docker',
  'ls', 'cat', 'head', 'tail', 'echo',
  'mkdir', 'cp', 'mv', 'rm', 'chmod',
  'curl', 'wget',
  'rg', 'find', 'grep',
  'which', 'type',
  'pwd', 'whoami', 'env',
  'terraform', 'kubectl',
  'gh',
];

const BLOCKLIST_SUBSTRINGS = [
  'rm -rf /', 'rm -rf ~', 'rm -rf .',
  '>:',
  '| sh', '| bash',
  'sudo',
  'chmod 777',
];

export class TerminalTool {
  private activeProcesses: Map<string, ChildProcess> = new Map();

  isAllowed(command: string): { allowed: boolean; reason?: string } {
    const trimmed = command.trim();

    // Check blocklist first
    for (const blocked of BLOCKLIST_SUBSTRINGS) {
      if (trimmed.includes(blocked)) {
        return { allowed: false, reason: `Command contains blocked pattern: "${blocked}"` };
      }
    }

    // Check allowlist
    const firstWord = trimmed.split(/\s+/)[0];
    for (const prefix of ALLOWLIST_PREFIXES) {
      if (firstWord === prefix || trimmed.startsWith(prefix + ' ')) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: `Command not in allowlist: "${firstWord}". Allowed: ${ALLOWLIST_PREFIXES.slice(0, 10).join(', ')}...` };
  }

  async execute(
    command: string,
    options?: {
      timeout?: number;
      maxOutput?: number;
      cwd?: string;
      env?: Record<string, string>;
    }
  ): Promise<TerminalResult> {
    const check = this.isAllowed(command);
    if (!check.allowed) {
      return {
        stdout: '',
        stderr: check.reason || 'Command not allowed',
        exitCode: -1,
        timedOut: false,
        truncated: false
      };
    }

    const timeout = options?.timeout || 120000;
    const maxOutput = options?.maxOutput || 32768;

    return new Promise((resolve) => {
      try {
        const result = execSync(command, {
          timeout,
          encoding: 'utf-8',
          maxBuffer: maxOutput,
          cwd: options?.cwd,
          env: options?.env ? { ...process.env, ...options.env } : undefined
        });

        resolve({
          stdout: result,
          stderr: '',
          exitCode: 0,
          timedOut: false,
          truncated: result.length > maxOutput
        });
      } catch (error: any) {
        const stdout = error.stdout || '';
        const stderr = error.stderr || '';
        const timedOut = error.killed || error.signal === 'SIGTERM';

        resolve({
          stdout: stdout.slice(0, maxOutput),
          stderr: stderr.slice(0, maxOutput),
          exitCode: error.status !== undefined ? error.status : -1,
          timedOut,
          truncated: stdout.length > maxOutput || stderr.length > maxOutput
        });
      }
    });
  }

  async executeAsync(
    sessionId: string,
    command: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
    }
  ): Promise<string> {
    // Kill existing process with same session ID
    this.kill(sessionId);

    const child = exec(command, {
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : undefined
    });

    this.activeProcesses.set(sessionId, child);

    return sessionId;
  }

  kill(sessionId?: string): void {
    if (sessionId) {
      const proc = this.activeProcesses.get(sessionId);
      if (proc) {
        proc.kill('SIGTERM');
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch { /* ignore */ }
        }, 3000);
        this.activeProcesses.delete(sessionId);
      }
    } else {
      // Kill all
      for (const [id, proc] of this.activeProcesses) {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      }
      this.activeProcesses.clear();
    }
  }
}
