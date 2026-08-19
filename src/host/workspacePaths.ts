import * as vscode from 'vscode';

/**
 * Resolve a path the Plan V2 model reported to workspace-relative segments,
 * or null if it can't be safely resolved.
 */
export function resolveWorkspaceRelativeSegments(
  rawPath: string,
  folder: vscode.WorkspaceFolder
): string[] | null {
  let normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const isDriveAbsolute = /^[A-Za-z]:\//.test(normalized);
  const isPosixAbsolute = !isDriveAbsolute && rawPath.startsWith('/');
  if (isDriveAbsolute || isPosixAbsolute) {
    const root = folder.uri.fsPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const abs = isDriveAbsolute ? normalized : `/${normalized}`;
    const onWin = process.platform === 'win32';
    const rootCmp = onWin ? root.toLowerCase() : root;
    const absCmp = onWin ? abs.toLowerCase() : abs;
    if (absCmp === rootCmp || absCmp.startsWith(`${rootCmp}/`)) {
      normalized = abs.slice(root.length).replace(/^\/+/, '');
    } else {
      return null;
    }
  }
  const segments = normalized.split('/').filter(Boolean);
  if (!normalized || normalized.includes('\0') || segments.includes('..')) {
    return null;
  }
  return segments;
}
