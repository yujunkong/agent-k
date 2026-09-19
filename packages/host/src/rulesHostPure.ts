/**
 * SET-013 — pure rule-id/path helpers (no vscode/fs; testable).
 * v2.1 `rulesHostHandlers` parity.
 */
import * as path from 'path';
import {
  AGENTK_DIR,
  DEFAULT_RULES_FILE,
  PROJECT_CUSTOM_RULES_DIR,
  isAllowedCustomRuleName,
} from '@agent-k/core';

export interface ResolvedRule {
  abs: string;
  relPath: string;
  kind: 'basic' | 'custom';
  fileName: string;
}

/** Resolve a Rules-tab id (`basic` / `.agentrules` / `.agentk/rules/<file>`) to a path. */
export function resolveRuleId(root: string, id: string): ResolvedRule | null {
  const normalized = String(id || '').replace(/\\/g, '/').trim();
  if (!normalized) return null;

  if (normalized === 'basic' || normalized === DEFAULT_RULES_FILE) {
    return {
      abs: path.join(root, DEFAULT_RULES_FILE),
      relPath: DEFAULT_RULES_FILE,
      kind: 'basic',
      fileName: DEFAULT_RULES_FILE,
    };
  }

  const prefix = `${PROJECT_CUSTOM_RULES_DIR}/`;
  const fileName = path.posix.basename(
    normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized,
  );
  if (!isAllowedCustomRuleName(fileName)) return null;

  return {
    abs: path.join(root, AGENTK_DIR, 'rules', fileName),
    relPath: `${PROJECT_CUSTOM_RULES_DIR}/${fileName}`,
    kind: 'custom',
    fileName,
  };
}

/** Title → kebab-case file stem (v2.1 parity). */
export function slugFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'rule';
}

/** Unique `<stem>.md` name — `exists` is injected so this stays pure. */
export function uniqueCustomFileName(
  exists: (fileName: string) => boolean,
  title: string,
): string {
  const stem = slugFromTitle(title);
  let candidate = `${stem}.md`;
  let n = 2;
  while (exists(candidate)) {
    candidate = `${stem}-${n}.md`;
    n += 1;
  }
  return candidate;
}
