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
import {
  buildEditDiffPreview,
  buildWriteFileDiffPreview,
  guessLanguageFromPath
} from '../chat/editDiffPreview';

/** VS Code 없는 단위/E2E 환경에서는 process.cwd() 사용 */
export function getWorkspaceRoot(): string {
  const roots = getWorkspaceRoots();
  return roots[0] || process.cwd();
}

/** Multi-root workspace folders (first = primary) */
export function getWorkspaceRoots(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require('vscode') as typeof import('vscode');
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length) {
      return folders.map((f) => path.resolve(f.uri.fsPath));
    }
  } catch {
    /* tests / no vscode */
  }
  return [path.resolve(process.cwd())];
}

/**
 * 상대/절대 경로를 워크스페이스 루트 기준으로 정규화 (루트 탈출 시 거부).
 * Multi-root: any folder in the workspace is allowed.
 */
export function resolveWorkspacePath(filePath: string): { abs: string } | { error: string } {
  const roots = getWorkspaceRoots();
  const abs = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(roots[0], filePath);

  for (const root of roots) {
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    if (abs === root || abs.startsWith(rootWithSep)) {
      return { abs };
    }
  }

  return {
    error: `Path escapes workspace root: ${filePath} (open that folder in VS Code, or use a path under ${roots[0]})`
  };
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

  let beforeContent = '';
  try {
    beforeContent = fs.readFileSync(resolved.abs, 'utf-8');
  } catch {
    beforeContent = '';
  }
  const diff = buildEditDiffPreview(hunks, beforeContent);
  const root = getWorkspaceRoot();
  const relPath = path.relative(root, resolved.abs) || path.basename(resolved.abs);

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
      relPath,
      modified: result.modified,
      checkpointId: result.checkpointId,
      language: guessLanguageFromPath(resolved.abs),
      diff
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
  let previousContent: string | undefined;
  if (fs.existsSync(resolved.abs)) {
    previousContent = fs.readFileSync(resolved.abs, 'utf-8');
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

  const root = getWorkspaceRoot();
  const relPath = path.relative(root, resolved.abs) || path.basename(resolved.abs);
  const diff = buildWriteFileDiffPreview(content, previousContent);

  return {
    success: true,
    data: {
      path: resolved.abs,
      relPath,
      bytesWritten: Buffer.byteLength(content, 'utf-8'),
      language: guessLanguageFromPath(resolved.abs),
      diff
    }
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

export async function executeRunTerminalCmd(
  input: ToolInput,
  opts?: {
    onChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  }
): Promise<ToolOutput> {
  const command = String(
    (input.command as string) ||
      (input.cmd as string) ||
      (input.shell as string) ||
      ''
  ).trim();
  if (!command) {
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

  const cwd =
    typeof input.cwd === 'string' && input.cwd.trim()
      ? path.isAbsolute(input.cwd)
        ? input.cwd
        : path.join(getWorkspaceRoot(), input.cwd)
      : getWorkspaceRoot();
  const timeoutMs = (input.timeout as number) || 120_000;

  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      env: process.env
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      opts?.onChunk?.(text, 'stdout');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      opts?.onChunk?.(text, 'stderr');
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        success: false,
        error: `Command timed out after ${timeoutMs}ms`,
        data: {
          command,
          cwd,
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 50_000),
          exitCode: null,
          description: input.description
        }
      });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      const ok = code === 0;
      resolve({
        success: ok,
        data: {
          command,
          cwd,
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 50_000),
          exitCode: code,
          description: input.description
        },
        error: ok
          ? undefined
          : `Exit code ${code}${stderr.trim() ? `: ${stderr.trim().slice(0, 200)}` : stdout.trim() ? `: ${stdout.trim().slice(0, 200)}` : ''}`
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        error: err.message,
        data: { command, cwd, stdout, stderr, exitCode: null }
      });
    });
  });
}
