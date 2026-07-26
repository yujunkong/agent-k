/**
 * Build a compact unified-style preview from search/replace hunks (chat FileEditCard).
 */
export interface EditDiffLine {
  type: 'add' | 'delete' | 'context';
  lineNumber: number;
  text: string;
}

export interface EditDiffPreview {
  additions: number;
  deletions: number;
  lines: EditDiffLine[];
}

function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}

function lineStartAt(content: string, index: number): number {
  if (index <= 0) return 1;
  return content.slice(0, index).split('\n').length;
}

/** Cap preview size so webview payloads stay small */
const MAX_PREVIEW_LINES = 60;

/**
 * Approximate unified preview: each hunk as deletes then adds (no LCS).
 * Line numbers are based on the pre-edit file when `beforeContent` is given.
 */
export function buildEditDiffPreview(
  hunks: Array<{ oldText: string; newText: string }>,
  beforeContent?: string
): EditDiffPreview {
  const lines: EditDiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  for (const hunk of hunks) {
    const oldText = hunk.oldText ?? '';
    const newText = hunk.newText ?? '';
    let startLine = 1;
    if (beforeContent && oldText) {
      const idx = beforeContent.indexOf(oldText);
      if (idx >= 0) startLine = lineStartAt(beforeContent, idx);
    } else if (beforeContent && !oldText && newText) {
      // Pure insert — pin near end of file for display
      startLine = Math.max(1, countLines(beforeContent));
    }

    const oldLines = oldText === '' ? [] : oldText.split('\n');
    const newLines = newText === '' ? [] : newText.split('\n');

    let n = startLine;
    for (const text of oldLines) {
      deletions++;
      if (lines.length < MAX_PREVIEW_LINES) {
        lines.push({ type: 'delete', lineNumber: n, text });
      }
      n++;
    }
    n = startLine;
    for (const text of newLines) {
      additions++;
      if (lines.length < MAX_PREVIEW_LINES) {
        lines.push({ type: 'add', lineNumber: n, text });
      }
      n++;
    }
  }

  return { additions, deletions, lines };
}

export function buildWriteFileDiffPreview(
  content: string,
  previousContent?: string
): EditDiffPreview {
  const newLines = content === '' ? [] : content.split('\n');
  const oldLines =
    previousContent === undefined || previousContent === ''
      ? []
      : previousContent.split('\n');

  if (oldLines.length === 0) {
    const lines: EditDiffLine[] = newLines
      .slice(0, MAX_PREVIEW_LINES)
      .map((text, i) => ({ type: 'add' as const, lineNumber: i + 1, text }));
    return { additions: newLines.length, deletions: 0, lines };
  }

  // Treat full overwrite as delete-all + add-all (compact)
  return buildEditDiffPreview(
    [{ oldText: previousContent!, newText: content }],
    previousContent
  );
}

export function guessLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    md: 'markdown',
    json: 'json',
    css: 'css',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml'
  };
  return map[ext] || ext || 'text';
}

export function languageBadge(filePath: string): string {
  const ext = filePath.split('.').pop()?.toUpperCase() || 'FILE';
  if (ext === 'TSX') return 'TS';
  if (ext === 'JSX') return 'JS';
  return ext.slice(0, 4);
}
