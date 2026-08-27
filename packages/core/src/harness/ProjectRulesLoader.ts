/**
 * HARNESS-005 — Project rules loader (Claude CLAUDE.md 대응).
 *
 * Workspace AGENTS.md / .cursorrules / .agentrules / .clinerules and
 * `.agentk/rules/*` (+ `.cursor/rules/*`) are concatenated into a PROJECT RULES
 * block for Agent context. Lives **outside** conversation compaction — re-read
 * each turn into the protected system/sticky slot.
 *
 * Ported from v2.1 `src/harness/ProjectRulesLoader.ts` (ADDON-T08). fs only —
 * no vscode (unit-testable).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AGENTK_DIR } from '../config/ProjectConfig';

/** Discovery order — concatenated in this order when multiple files exist. */
export const PROJECT_RULES_FILES = [
  'AGENTS.md',
  '.cursorrules',
  '.agentrules',
  '.clinerules',
] as const;

/** Workspace-root basic rules file owned by Settings → Rules. */
export const DEFAULT_RULES_FILE = '.agentrules';

/** Custom rule files live here (one file per rule). */
export const PROJECT_CUSTOM_RULES_DIR = `${AGENTK_DIR}/rules`;

/** Cursor IDE project rules (mdc/md) — Work Order “Cursor rules 일부”. */
export const CURSOR_RULES_DIR = '.cursor/rules';

const CUSTOM_RULE_EXTS = new Set(['.md', '.mdc', '.txt']);

export type ProjectRuleKind = 'basic' | 'custom' | 'cursor';

export interface ProjectRuleFile {
  kind: ProjectRuleKind;
  /** Workspace-relative path with posix separators */
  relPath: string;
  fileName: string;
}

interface ProjectRulesCacheEntry {
  content: string;
  mtimeKey: string;
}

const cache = new Map<string, ProjectRulesCacheEntry>();

export function isAllowedCustomRuleName(name: string): boolean {
  if (!name || name.startsWith('.') || name.includes('/') || name.includes('\\')) {
    return false;
  }
  return CUSTOM_RULE_EXTS.has(path.extname(name).toLowerCase());
}

/** Sorted basenames under a rules dir. Never throws. */
function listRuleFileNamesInDir(dir: string): string[] {
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => isAllowedCustomRuleName(name))
      .filter((name) => {
        try {
          return fs.statSync(path.join(dir, name)).isFile();
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } catch {
    return [];
  }
}

/** Sorted basenames of custom rule files under `.agentk/rules`. Never throws. */
export function listCustomRuleFileNames(rootDir: string): string[] {
  if (!rootDir) return [];
  return listRuleFileNamesInDir(path.join(rootDir, AGENTK_DIR, 'rules'));
}

/** Sorted basenames under `.cursor/rules`. Never throws. */
export function listCursorRuleFileNames(rootDir: string): string[] {
  if (!rootDir) return [];
  return listRuleFileNamesInDir(path.join(rootDir, CURSOR_RULES_DIR));
}

/**
 * Basic `.agentrules` plus every custom file in `.agentk/rules` and `.cursor/rules`.
 * Basic is always listed (even if the file does not exist yet).
 */
export function listProjectRuleFiles(rootDir: string): ProjectRuleFile[] {
  const items: ProjectRuleFile[] = [
    {
      kind: 'basic',
      relPath: DEFAULT_RULES_FILE,
      fileName: DEFAULT_RULES_FILE,
    },
  ];
  for (const fileName of listCustomRuleFileNames(rootDir)) {
    items.push({
      kind: 'custom',
      relPath: `${PROJECT_CUSTOM_RULES_DIR}/${fileName}`,
      fileName,
    });
  }
  for (const fileName of listCursorRuleFileNames(rootDir)) {
    items.push({
      kind: 'cursor',
      relPath: `${CURSOR_RULES_DIR}/${fileName}`,
      fileName,
    });
  }
  return items;
}

export function titleFromRuleContent(content: string, fallback: string): string {
  for (const raw of (content || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#+\s+(.+)$/);
    const text = (heading ? heading[1] : line).trim();
    if (!text) continue;
    return text.length > 72 ? `${text.slice(0, 72)}…` : text;
  }
  return fallback;
}

function readRuleFile(filePath: string): string {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return '';
  return fs.readFileSync(filePath, 'utf-8').trim();
}

/**
 * Pure fs-based loader — reads each rules file present at rootDir (in
 * PROJECT_RULES_FILES order, then `.agentk/rules`, then `.cursor/rules`) and
 * concatenates them, truncated to maxChars. Never throws.
 */
export function loadProjectRulesFromFs(rootDir: string, maxChars = 12_000): string {
  if (!rootDir) return '';
  const parts: string[] = [];

  for (const fileName of PROJECT_RULES_FILES) {
    try {
      const content = readRuleFile(path.join(rootDir, fileName));
      if (content) {
        parts.push(`# ${fileName}\n${content}`);
      }
    } catch {
      // Unreadable file — skip, never throw
    }
  }

  for (const fileName of listCustomRuleFileNames(rootDir)) {
    try {
      const relPath = `${PROJECT_CUSTOM_RULES_DIR}/${fileName}`;
      const content = readRuleFile(path.join(rootDir, AGENTK_DIR, 'rules', fileName));
      if (content) {
        parts.push(`# ${relPath}\n${content}`);
      }
    } catch {
      // skip
    }
  }

  for (const fileName of listCursorRuleFileNames(rootDir)) {
    try {
      const relPath = `${CURSOR_RULES_DIR}/${fileName}`;
      const content = readRuleFile(path.join(rootDir, CURSOR_RULES_DIR, fileName));
      if (content) {
        parts.push(`# ${relPath}\n${content}`);
      }
    } catch {
      // skip
    }
  }

  const combined = parts.join('\n\n');
  if (combined.length <= maxChars) return combined;
  return `${combined.slice(0, maxChars)}\n...(truncated, original ${combined.length} chars)`;
}

/** Wrap loaded rules content into a `## PROJECT RULES` context block. No-op on empty. */
export function formatProjectRulesBlock(content: string): string {
  const trimmed = (content || '').trim();
  if (!trimmed) return '';
  return `## PROJECT RULES\n${trimmed}`;
}

function computeMtimeKey(rootDir: string): string {
  const stamps: string[] = [];
  for (const fileName of PROJECT_RULES_FILES) {
    try {
      const stat = fs.statSync(path.join(rootDir, fileName));
      stamps.push(`${fileName}:${stat.mtimeMs}:${stat.size}`);
    } catch {
      stamps.push(`${fileName}:0`);
    }
  }
  const customNames = listCustomRuleFileNames(rootDir);
  stamps.push(`custom:${customNames.join(',')}`);
  for (const fileName of customNames) {
    try {
      const stat = fs.statSync(path.join(rootDir, AGENTK_DIR, 'rules', fileName));
      stamps.push(`${fileName}:${stat.mtimeMs}:${stat.size}`);
    } catch {
      stamps.push(`${fileName}:0`);
    }
  }
  const cursorNames = listCursorRuleFileNames(rootDir);
  stamps.push(`cursor:${cursorNames.join(',')}`);
  for (const fileName of cursorNames) {
    try {
      const stat = fs.statSync(path.join(rootDir, CURSOR_RULES_DIR, fileName));
      stamps.push(`cursor-${fileName}:${stat.mtimeMs}:${stat.size}`);
    } catch {
      stamps.push(`cursor-${fileName}:0`);
    }
  }
  return stamps.join('|');
}

/**
 * Cached loader — re-reads from disk only when a watched file's mtime/size changes.
 * Safe to call every AgentLoop turn without dominating I/O.
 */
export function getProjectRulesCached(rootDir: string, maxChars = 12_000): string {
  if (!rootDir) return '';
  const resolved = path.resolve(rootDir);
  const mtimeKey = computeMtimeKey(resolved);
  const cached = cache.get(resolved);
  if (cached && cached.mtimeKey === mtimeKey) {
    return cached.content;
  }
  const content = loadProjectRulesFromFs(resolved, maxChars);
  cache.set(resolved, { content, mtimeKey });
  return content;
}

/** Invalidate the cache for one workspace root, or every cached root when omitted. */
export function invalidateProjectRulesCache(rootDir?: string): void {
  if (rootDir) {
    cache.delete(path.resolve(rootDir));
  } else {
    cache.clear();
  }
}

/**
 * Resolve rules text for inject: explicit override wins, else cached fs load.
 * Never throws.
 */
export function resolveProjectRulesContent(opts: {
  workspaceRoot?: string;
  projectRules?: string;
  maxChars?: number;
}): string {
  const explicit = String(opts.projectRules || '').trim();
  if (explicit) return explicit;
  const root = String(opts.workspaceRoot || '').trim();
  if (!root) return '';
  try {
    return getProjectRulesCached(root, opts.maxChars ?? 12_000);
  } catch {
    return '';
  }
}
