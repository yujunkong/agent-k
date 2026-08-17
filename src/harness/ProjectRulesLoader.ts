/**
 * ProjectRulesLoader — ADDON-T08: 프로젝트 규칙 파일 자동 로드
 *
 * 워크스페이스 루트 AGENTS.md / .cursorrules / .agentrules / .clinerules 와
 * `.agentk/rules/` 커스텀 룰을 찾아 연결(concatenate)하고 PROJECT RULES 블록으로 포맷한다.
 * 파일이 없으면 no-op(빈 문자열). fs만 사용 — vscode 의존 없음 (단위 테스트 가능).
 */
import * as fs from 'fs';
import * as path from 'path';
import { AGENTK_DIR } from '../core/ProjectConfig';

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

const CUSTOM_RULE_EXTS = new Set(['.md', '.mdc', '.txt']);

export type ProjectRuleKind = 'basic' | 'custom';

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

/** Sorted basenames of custom rule files under `.agentk/rules`. Never throws. */
export function listCustomRuleFileNames(rootDir: string): string[] {
  if (!rootDir) return [];
  const dir = path.join(rootDir, AGENTK_DIR, 'rules');
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

/**
 * Basic `.agentrules` plus every custom file in `.agentk/rules`.
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
 * PROJECT_RULES_FILES order, then `.agentk/rules`) and concatenates them,
 * truncated to maxChars. Never throws: unreadable/missing files are skipped.
 */
export function loadProjectRulesFromFs(rootDir: string, maxChars = 12000): string {
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
      // Unreadable file — skip, never throw
    }
  }

  const combined = parts.join('\n\n');
  if (combined.length <= maxChars) return combined;
  return `${combined.slice(0, maxChars)}\n...(truncated, original ${combined.length} chars)`;
}

/** Wrap loaded rules content into a `## PROJECT RULES` context block. No-op on empty content. */
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
  return stamps.join('|');
}

/**
 * Cached loader — re-reads from disk only when a watched file's mtime/size changes.
 * Safe to call every turn without re-stat/read overhead dominating.
 */
export function getProjectRulesCached(rootDir: string, maxChars = 12000): string {
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
