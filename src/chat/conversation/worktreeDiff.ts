/**
 * Worktree unified diff parsing for subagent review UI.
 */
import type { SubagentWorktreeReviewPreview } from './subagentResult';

export type WorktreeDiffLine = {
  type: 'add' | 'delete' | 'context';
  text: string;
};

export type WorktreeDiffFile = {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | '?';
  additions: number;
  deletions: number;
  lines: WorktreeDiffLine[];
};

export type WorktreeDiffTotals = {
  fileCount: number;
  additions: number;
  deletions: number;
};

export function normalizeRepoPath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
}

function countDiffLineStats(body: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

function diffBodyToLines(body: string): WorktreeDiffLine[] {
  const out: WorktreeDiffLine[] = [];
  for (const raw of body.split(/\r?\n/)) {
    if (!raw || raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('@@')) {
      continue;
    }
    if (raw.startsWith('+')) {
      out.push({ type: 'add', text: raw.slice(1) });
    } else if (raw.startsWith('-')) {
      out.push({ type: 'delete', text: raw.slice(1) });
    } else if (raw.startsWith(' ') || raw.startsWith('\t')) {
      out.push({ type: 'context', text: raw.slice(1) });
    }
  }
  return out;
}

/** Split a unified git diff into per-file rows. */
export function parseWorktreeUnifiedDiff(diff: string): WorktreeDiffFile[] {
  const text = String(diff || '').trim();
  if (!text) return [];

  const parts = text.split(/^diff --git /m).filter(Boolean);
  const files: WorktreeDiffFile[] = [];

  for (const part of parts) {
    const chunk = `diff --git ${part}`;
    const header = chunk.match(/^diff --git a\/(.+?) b\/(.+?)(?:\r?\n|$)/);
    if (!header) continue;

    const oldPath = normalizeRepoPath(header[1]);
    const newPath = normalizeRepoPath(header[2]);
    const bodyStart = chunk.indexOf('\n');
    const body = bodyStart >= 0 ? chunk.slice(bodyStart + 1) : '';

    let status: WorktreeDiffFile['status'] = 'M';
    if (/^deleted file mode/m.test(chunk) || newPath === 'dev/null') {
      status = 'D';
    } else if (/^new file mode/m.test(chunk) || oldPath === 'dev/null') {
      status = 'A';
    } else if (/^rename from /m.test(chunk)) {
      status = 'R';
    }

    const path =
      status === 'D'
        ? oldPath !== 'dev/null'
          ? oldPath
          : newPath
        : newPath !== 'dev/null'
          ? newPath
          : oldPath;

    const stats = countDiffLineStats(body);
    files.push({
      path,
      status,
      additions: stats.additions,
      deletions: stats.deletions,
      lines: diffBodyToLines(body)
    });
  }

  return files;
}

export function buildWorktreeDiffFiles(
  preview?: SubagentWorktreeReviewPreview
): WorktreeDiffFile[] {
  if (!preview) return [];
  const parsed = parseWorktreeUnifiedDiff(String(preview.diff || ''));
  const byPath = new Map(parsed.map((file) => [file.path, file]));

  for (const raw of preview.files ?? []) {
    const path = normalizeRepoPath(raw);
    if (!path || byPath.has(path)) continue;
    byPath.set(path, {
      path,
      status: 'M',
      additions: 0,
      deletions: 0,
      lines: []
    });
  }

  for (const raw of preview.untrackedFiles ?? []) {
    const path = normalizeRepoPath(raw);
    if (!path || byPath.has(path)) continue;
    byPath.set(path, {
      path,
      status: '?',
      additions: 0,
      deletions: 0,
      lines: []
    });
  }

  const ordered = [...(preview.files ?? []).map(normalizeRepoPath), ...parsed.map((f) => f.path)];
  const seen = new Set<string>();
  const result: WorktreeDiffFile[] = [];
  for (const path of ordered) {
    if (!path || seen.has(path)) continue;
    const file = byPath.get(path);
    if (file) {
      seen.add(path);
      result.push(file);
    }
  }
  for (const file of parsed) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    result.push(file);
  }
  for (const file of byPath.values()) {
    if (seen.has(file.path)) continue;
    result.push(file);
  }
  return result;
}

export function worktreeDiffTotals(
  preview?: SubagentWorktreeReviewPreview,
  filesChanged?: number
): WorktreeDiffTotals {
  const files = buildWorktreeDiffFiles(preview);
  const totals = files.reduce(
    (acc, file) => {
      acc.additions += file.additions;
      acc.deletions += file.deletions;
      return acc;
    },
    { additions: 0, deletions: 0 }
  );
  return {
    fileCount: files.length || filesChanged || 0,
    additions: totals.additions,
    deletions: totals.deletions
  };
}
