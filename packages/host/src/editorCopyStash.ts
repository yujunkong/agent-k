/**
 * CHAT-005 — copy-time path stash for Composer paste.
 *
 * VS Code webviews only receive text/plain on paste, so path/range must be
 * captured when the user copies (Cmd/Ctrl+C) in the editor — never inferred
 * from whichever file is active later.
 */

export type EditorCopyStash = {
  path: string;
  label: string;
  content: string;
  startLine: number;
  endLine: number;
  at: number;
};

let lastCopy: EditorCopyStash | null = null;

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path;
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n');
}

/** Record a copy/cut from a file editor (call before cut mutates the buffer). */
export function rememberEditorCopy(input: {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  label?: string;
}): void {
  const content = normalizeNewlines(input.content);
  if (!content.trim() || !input.path) {
    return;
  }
  lastCopy = {
    path: input.path,
    label: input.label || basename(input.path),
    content,
    startLine: input.startLine,
    endLine: input.endLine,
    at: Date.now(),
  };
}

export function clearEditorCopyStash(): void {
  lastCopy = null;
}

/** Test helper / diagnostics. */
export function peekEditorCopyStash(): EditorCopyStash | null {
  return lastCopy;
}

/**
 * Resolve paste text against the copy-time stash.
 * Content must match; path comes from the stash (not the active editor).
 */
export function matchPasteToCopyStash(content: string): EditorCopyStash | null {
  if (!lastCopy) return null;
  const needle = normalizeNewlines(content);
  if (!needle.trim()) return null;
  if (needle !== lastCopy.content) return null;
  return lastCopy;
}
