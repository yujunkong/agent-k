/**
 * ProjectRulesLoader — ADDON-T08: 프로젝트 규칙 파일 자동 로드
 *
 * AGENTS.md, .cursorrules, .agentrules, .clinerules를 워크스페이스 루트에서 찾아
 * 이 순서로 연결(concatenate)하고 PROJECT RULES 블록으로 포맷한다.
 * 파일이 없으면 no-op(빈 문자열). fs만 사용 — vscode 의존 없음 (단위 테스트 가능).
 */
import * as fs from 'fs';
import * as path from 'path';

/** Discovery order — concatenated in this order when multiple files exist. */
export const PROJECT_RULES_FILES = [
  'AGENTS.md',
  '.cursorrules',
  '.agentrules',
  '.clinerules',
] as const;

interface ProjectRulesCacheEntry {
  content: string;
  mtimeKey: string;
}

const cache = new Map<string, ProjectRulesCacheEntry>();

/**
 * Pure fs-based loader — reads each rules file present at rootDir (in
 * PROJECT_RULES_FILES order) and concatenates them, truncated to maxChars.
 * Never throws: unreadable/missing files are skipped.
 */
export function loadProjectRulesFromFs(rootDir: string, maxChars = 12000): string {
  if (!rootDir) return '';
  const parts: string[] = [];

  for (const fileName of PROJECT_RULES_FILES) {
    try {
      const filePath = path.join(rootDir, fileName);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      if (content) {
        parts.push(`# ${fileName}\n${content}`);
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
