/**
 * EXT-005 — Workspace path abstraction (SAFE).
 * Normalize / validate paths relative to a workspace folder root.
 * Pure core has no vscode import so unit tests stay node-friendly.
 */

export interface WorkspaceFolderLike {
  /** Absolute fs path of the workspace folder (posix or win32). */
  fsPath: string;
}

/** Detect win32 for case-folding without requiring @types/node. */
function isWin32Platform(platformOverride?: 'win32' | 'posix'): boolean {
  if (platformOverride === 'win32') return true;
  if (platformOverride === 'posix') return false;
  // Extension Host / Node: read platform via globalThis to stay type-safe.
  const proc = (globalThis as { process?: { platform?: string } }).process;
  return proc?.platform === 'win32';
}

/**
 * Resolve a model-/tool-reported path to workspace-relative segments,
 * or null if it cannot be safely resolved (escape, null byte, outside root).
 *
 * @param rawPath Absolute or relative path from the model/tool
 * @param folder Workspace folder (fsPath only required)
 * @param platformOverride Optional platform override for tests (`win32` | `posix`)
 */
export function resolveWorkspaceRelativeSegments(
  rawPath: string,
  folder: WorkspaceFolderLike,
  platformOverride?: 'win32' | 'posix',
): string[] | null {
  // Reject empty / null-byte paths early.
  if (!rawPath || rawPath.includes('\0')) {
    return null;
  }

  let normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const isDriveAbsolute = /^[A-Za-z]:\//.test(normalized);
  const isPosixAbsolute = !isDriveAbsolute && rawPath.startsWith('/');

  if (isDriveAbsolute || isPosixAbsolute) {
    const root = folder.fsPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const abs = isDriveAbsolute ? normalized : `/${normalized}`;
    const onWin = isWin32Platform(platformOverride);
    const rootCmp = onWin ? root.toLowerCase() : root;
    const absCmp = onWin ? abs.toLowerCase() : abs;

    // Must stay under the workspace root (exact or child).
    if (absCmp === rootCmp || absCmp.startsWith(`${rootCmp}/`)) {
      normalized = abs.slice(root.length).replace(/^\/+/, '');
    } else {
      return null;
    }
  }

  const segments = normalized.split('/').filter(Boolean);
  // Reject empty relative result and path traversal.
  if (!normalized || segments.includes('..')) {
    return null;
  }
  return segments;
}

/**
 * Join resolved segments back into a workspace-relative posix path.
 * Returns null when resolve fails.
 */
export function toWorkspaceRelativePath(
  rawPath: string,
  folder: WorkspaceFolderLike,
  platformOverride?: 'win32' | 'posix',
): string | null {
  const segments = resolveWorkspaceRelativeSegments(rawPath, folder, platformOverride);
  if (!segments) {
    return null;
  }
  return segments.join('/');
}
