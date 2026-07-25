/**
 * 쓰기/터미널 도구 실행기 (RW-C5/C7 배선)
 *
 * edit_file / write_file / delete_file / run_terminal_cmd — 워크스페이스 루트 밖 경로 차단.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { ToolInput, ToolOutput } from './types';
import type { SearchReplaceHunk } from './patchDocument';
import { PatchApplier } from '../patches/applier';
import { StalenessChecker } from '../patches/staleness';
import { CheckpointManager } from '../checkpoint/CheckpointManager';
import { RuntimeServices } from '../core/RuntimeServices';

/** VS Code 없는 단위/E2E 환경에서는 process.cwd() 사용 */
export function getWorkspaceRoot(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require('vscode') as typeof import('vscode');
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  } catch {
    return process.cwd();
  }
}

/**
 * 상대/절대 경로를 워크스페이스 루트 기준으로 정규화 (루트 탈출 시 거부)
 */
export function resolveWorkspacePath(filePath: string): { abs: string } | { error: string } {
  const root = path.resolve(getWorkspaceRoot());
  const abs = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    return { error: `Path escapes workspace root: ${filePath}` };
  }
  return { abs };
}

function getCheckpointManager(): CheckpointManager {
  return RuntimeServices.getCheckpointManager() ?? new CheckpointManager();
}

/** HARB-T21: StalenessChecker 인스턴스 (전역 싱글톤) */
const stalenessChecker = new StalenessChecker();

/** read_file 후 edit_file 허용을 위한 스냅샷 기록 (HARB 선독→편집 경로) */
export function recordFileReadForStaleness(absPath: string): void {
  stalenessChecker.recordRead(absPath);
}

export async function executeEditFile(input: ToolInput): Promise<ToolOutput> {
  const filePath = input.path as string;
  if (!filePath) {
    return { success: false, error: 'edit_file requires path' };
  }
  const resolved = resolveWorkspacePath(filePath);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  // HARB-T21: Staleness check — 파일이 마지막 read 이후 변경되었는지 확인
  if (stalenessChecker.isStale(resolved.abs)) {
    return {
      success: false,
      error: `File "${resolved.abs}" has changed since last read. Please read it again with read_file before editing.`,
      data: { stale: true, path: resolved.abs }
    };
  }

  const hunks = (input.hunks || []) as SearchReplaceHunk[];
  if (!Array.isArray(hunks) || hunks.length === 0) {
    return { success: false, error: 'edit_file requires at least one hunk' };
  }

  const applier = new PatchApplier(getCheckpointManager());
  const result = await applier.apply(resolved.abs, hunks, {
    createCheckpoint: true,
    isComplete: input.isComplete as boolean | undefined
  });

  if (!result.success) {
    return { success: false, error: result.error || 'edit_file apply failed', data: result };
  }

  // HARB-T21: 편집 성공 후 staleness 기록 갱신
  stalenessChecker.recordRead(resolved.abs);

  return {
    success: true,
    data: {
      path: resolved.abs,
      modified: result.modified,
      checkpointId: result.checkpointId
    }
  };
}

export async function executeWriteFile(input: ToolInput): Promise<ToolOutput> {
  const filePath = input.path as string;
  const content = input.content as string;
  if (!filePath || content === undefined) {
    return { success: false, error: 'write_file requires path and content' };
  }
  const resolved = resolveWorkspacePath(filePath);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  const mgr = getCheckpointManager();
  if (fs.existsSync(resolved.abs)) {
    await mgr.createCheckpoint(
      [resolved.abs],
      `Pre-write: ${path.basename(resolved.abs)}`,
      { turnNumber: 0, mode: 'agent', trigger: 'first_write' }
    );
  }

  const dir = path.dirname(resolved.abs);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved.abs, content, 'utf-8');
  mgr.updateHash(resolved.abs);

  return {
    success: true,
    data: { path: resolved.abs, bytesWritten: Buffer.byteLength(content, 'utf-8') }
  };
}

export async function executeDeleteFile(input: ToolInput): Promise<ToolOutput> {
  const filePath = (input.path || input.filePath) as string;
  if (!filePath) {
    return { success: false, error: 'delete_file requires path' };
  }
  const resolved = resolveWorkspacePath(filePath);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }
  if (!fs.existsSync(resolved.abs)) {
    return { success: false, error: `File not found: ${resolved.abs}` };
  }

  const mgr = getCheckpointManager();
  await mgr.createCheckpoint(
    [resolved.abs],
    `Pre-delete: ${path.basename(resolved.abs)}`,
    { turnNumber: 0, mode: 'agent', trigger: 'dangerous_tool' }
  );

  fs.unlinkSync(resolved.abs);
  return { success: true, data: { path: resolved.abs, deleted: true } };
}

const BLOCKED_CMD_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/sd/i
];

export async function executeRunTerminalCmd(input: ToolInput): Promise<ToolOutput> {
  const command = input.command as string;
  if (!command?.trim()) {
    return { success: false, error: 'run_terminal_cmd requires command' };
  }
  for (const pattern of BLOCKED_CMD_PATTERNS) {
    if (pattern.test(command)) {
      return { success: false, error: `Blocked dangerous command pattern: ${command}` };
    }
  }
  if (command.includes('..')) {
    return { success: false, error: 'Path traversal (..) is not allowed in commands' };
  }

  const cwd = getWorkspaceRoot();
  const timeoutMs = (input.timeout as number) || 120_000;

  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      env: process.env
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        success: false,
        error: `Command timed out after ${timeoutMs}ms`,
        data: { stdout, stderr, exitCode: null }
      });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        data: {
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 50_000),
          exitCode: code,
          description: input.description
        },
        error: code !== 0 ? `Exit code ${code}` : undefined
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });
  });
}
