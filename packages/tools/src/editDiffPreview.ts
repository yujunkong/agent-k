/**
 * Unified-style preview for FileEditCard (TOOL-002 / TOOL-003).
 *
 * Prefer before→after file diff (not raw search/replace strings).
 * Emit full hunk lines — UI scrolls with max-height (no MAX_PREVIEW / “… more”).
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

const MAX_LCS_CELLS = 80_000;
const FILE_CONTEXT_RADIUS = 2;

type LineOp = { type: 'add' | 'delete' | 'context'; text: string };

/**
 * Split into display lines; drop the empty segment from a trailing newline
 * so `foo\n` is one line, not `foo` + blank delete/add.
 */
export function splitDiffLines(text: string): string[] {
  if (text === '') return [];
  const parts = text.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function linesEqual(a: string, b: string): boolean {
  if (a === '' && b === '') return false;
  return a === b;
}

function lineOpsLcs(oldLines: string[], newLines: string[]): LineOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  if (n === 0) {
    return newLines.map((text) => ({ type: 'add' as const, text }));
  }
  if (m === 0) {
    return oldLines.map((text) => ({ type: 'delete' as const, text }));
  }
  if (n * m > MAX_LCS_CELLS) {
    return [
      ...oldLines.map((text) => ({ type: 'delete' as const, text })),
      ...newLines.map((text) => ({ type: 'add' as const, text })),
    ];
  }

  const dp: Uint16Array[] = Array.from(
    { length: n + 1 },
    () => new Uint16Array(m + 1),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (linesEqual(oldLines[i - 1]!, newLines[j - 1]!)) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops: LineOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesEqual(oldLines[i - 1]!, newLines[j - 1]!)) {
      ops.push({ type: 'context', text: oldLines[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1]! >= dp[i - 1]![j]!)) {
      ops.push({ type: 'add', text: newLines[j - 1]! });
      j--;
    } else {
      ops.push({ type: 'delete', text: oldLines[i - 1]! });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

/**
 * Primary path for FileEditCard: diff real file before vs after.
 * Trims unchanged prefix/suffix, LCS the middle — full line list for UI scroll.
 */
export function buildBeforeAfterDiff(
  before: string,
  after: string,
): EditDiffPreview {
  const oldLines = splitDiffLines(before);
  const newLines = splitDiffLines(after);

  if (oldLines.length === 0) {
    const lines: EditDiffLine[] = newLines.map((text, i) => ({
      type: 'add' as const,
      lineNumber: i + 1,
      text,
    }));
    return { additions: newLines.length, deletions: 0, lines };
  }
  if (newLines.length === 0) {
    const lines: EditDiffLine[] = oldLines.map((text, i) => ({
      type: 'delete' as const,
      lineNumber: i + 1,
      text,
    }));
    return { additions: 0, deletions: oldLines.length, lines };
  }

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldMid = oldLines.slice(prefix, oldLines.length - suffix);
  const newMid = newLines.slice(prefix, newLines.length - suffix);

  if (oldMid.length === 0 && newMid.length === 0) {
    return { additions: 0, deletions: 0, lines: [] };
  }

  const lines: EditDiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  const ctxBefore = Math.min(FILE_CONTEXT_RADIUS, prefix);
  for (let k = prefix - ctxBefore; k < prefix; k++) {
    lines.push({
      type: 'context',
      lineNumber: k + 1,
      text: oldLines[k] ?? '',
    });
  }

  const ops = lineOpsLcs(oldMid, newMid);
  let oldLn = prefix + 1;
  let newLn = prefix + 1;
  for (const op of ops) {
    if (op.type === 'delete') {
      deletions++;
      lines.push({ type: 'delete', lineNumber: oldLn, text: op.text });
      oldLn++;
    } else if (op.type === 'add') {
      additions++;
      lines.push({ type: 'add', lineNumber: newLn, text: op.text });
      newLn++;
    } else {
      lines.push({ type: 'context', lineNumber: oldLn, text: op.text });
      oldLn++;
      newLn++;
    }
  }

  // Comment: suffix context numbered by *after* file (no gutter rewind after insert)
  const ctxAfter = Math.min(FILE_CONTEXT_RADIUS, suffix);
  const afterSuffixStart = newLines.length - suffix;
  for (let i = 0; i < ctxAfter; i++) {
    lines.push({
      type: 'context',
      lineNumber: afterSuffixStart + i + 1,
      text: newLines[afterSuffixStart + i] ?? '',
    });
  }

  return { additions, deletions, lines };
}

/**
 * Hunk-oriented preview (search/replace). Prefer buildBeforeAfterDiff for tools.
 */
export function buildEditDiffPreview(
  hunks: Array<{ oldText: string; newText: string }>,
  beforeContent?: string,
): EditDiffPreview {
  // Comment: when we have the full file, synthesize after and use before→after
  if (beforeContent != null && hunks.length === 1) {
    const h = hunks[0]!;
    const oldText = h.oldText ?? '';
    const newText = h.newText ?? '';
    if (oldText && beforeContent.includes(oldText)) {
      const after = beforeContent.replace(oldText, newText);
      return buildBeforeAfterDiff(beforeContent, after);
    }
    if (!oldText && newText) {
      return buildBeforeAfterDiff(beforeContent, beforeContent + newText);
    }
  }

  const lines: EditDiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  const fileLines = beforeContent ? splitDiffLines(beforeContent) : [];

  for (const hunk of hunks) {
    const oldText = hunk.oldText ?? '';
    const newText = hunk.newText ?? '';
    let startLine = 1;
    if (beforeContent && oldText) {
      const idx = beforeContent.indexOf(oldText);
      if (idx >= 0) startLine = lineStartAt(beforeContent, idx);
    } else if (beforeContent && !oldText && newText) {
      startLine = Math.max(1, countLines(beforeContent));
    }

    const oldLines = splitDiffLines(oldText);
    const newLines = splitDiffLines(newText);
    const ops = lineOpsLcs(oldLines, newLines);

    if (fileLines.length > 0 && startLine > 1) {
      const from = Math.max(0, startLine - 1 - FILE_CONTEXT_RADIUS);
      for (let k = from; k < startLine - 1; k++) {
        lines.push({
          type: 'context',
          lineNumber: k + 1,
          text: fileLines[k] ?? '',
        });
      }
    }

    let oldLn = startLine;
    let newLn = startLine;
    for (const op of ops) {
      if (op.type === 'delete') {
        deletions++;
        lines.push({ type: 'delete', lineNumber: oldLn, text: op.text });
        oldLn++;
      } else if (op.type === 'add') {
        additions++;
        lines.push({ type: 'add', lineNumber: newLn, text: op.text });
        newLn++;
      } else {
        lines.push({ type: 'context', lineNumber: oldLn, text: op.text });
        oldLn++;
        newLn++;
      }
    }
  }

  return { additions, deletions, lines };
}

export function buildWriteFileDiffPreview(
  content: string,
  previousContent?: string,
): EditDiffPreview {
  return buildBeforeAfterDiff(previousContent ?? '', content);
}
