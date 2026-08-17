/**
 * Host handlers for Settings → Rules tab.
 *
 * Messages:
 *   rules.list   { requestId }
 *   rules.load   { requestId, id }
 *   rules.save   { requestId, id, content }
 *   rules.create { requestId, title? }
 *   rules.delete { requestId, id }
 *
 * Responses (webview):
 *   rules.listed  { requestId, rules, otherFiles }
 *   rules.loaded  { requestId, id, content, path, kind }
 *   rules.saved   { requestId, ok, path, title }
 *   rules.created { requestId, ok, rule, content }
 *   rules.deleted { requestId, ok, id }
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AGENTK_DIR } from '../core/ProjectConfig';
import {
  DEFAULT_RULES_FILE,
  PROJECT_CUSTOM_RULES_DIR,
  PROJECT_RULES_FILES,
  invalidateProjectRulesCache,
  isAllowedCustomRuleName,
  listProjectRuleFiles,
  titleFromRuleContent,
  type ProjectRuleKind,
} from '../harness/ProjectRulesLoader';

export { DEFAULT_RULES_FILE };

export interface RuleListItem {
  id: string;
  kind: ProjectRuleKind;
  fileName: string;
  title: string;
  path: string;
  exists: boolean;
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function posixJoin(...parts: string[]): string {
  return parts.join('/');
}

function resolveRuleId(
  root: string,
  id: string
): { abs: string; relPath: string; kind: ProjectRuleKind; fileName: string } | null {
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
    normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
  );
  if (!isAllowedCustomRuleName(fileName)) return null;

  return {
    abs: path.join(root, AGENTK_DIR, 'rules', fileName),
    relPath: posixJoin(PROJECT_CUSTOM_RULES_DIR, fileName),
    kind: 'custom',
    fileName,
  };
}

function readTitle(abs: string, fallback: string): { title: string; exists: boolean; content: string } {
  try {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const content = fs.readFileSync(abs, 'utf-8');
      return {
        title: titleFromRuleContent(content, fallback),
        exists: true,
        content,
      };
    }
  } catch {
    /* missing / unreadable */
  }
  return { title: fallback, exists: false, content: '' };
}

function collectOtherFiles(root: string): string[] {
  const otherFiles: string[] = [];
  for (const name of PROJECT_RULES_FILES) {
    if (name === DEFAULT_RULES_FILE) continue;
    try {
      const p = path.join(root, name);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        otherFiles.push(name);
      }
    } catch {
      /* skip */
    }
  }
  return otherFiles;
}

function listItems(root: string): RuleListItem[] {
  return listProjectRuleFiles(root).map((file) => {
    const abs = path.join(root, ...file.relPath.split('/'));
    const fallback = file.kind === 'basic' ? '기본 룰' : path.parse(file.fileName).name;
    const { title, exists } = readTitle(abs, fallback);
    return {
      id: file.relPath,
      kind: file.kind,
      fileName: file.fileName,
      title,
      path: abs,
      exists,
    };
  });
}

function slugFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'rule';
}

function uniqueCustomFileName(dir: string, title: string): string {
  const stem = slugFromTitle(title);
  let candidate = `${stem}.md`;
  let n = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem}-${n}.md`;
    n += 1;
  }
  return candidate;
}

export async function handleRulesList(
  webview: vscode.Webview | undefined,
  requestId: string
): Promise<void> {
  const post = (payload: Record<string, unknown>) => {
    void webview?.postMessage({ type: 'rules.listed', requestId, ...payload });
  };

  try {
    const root = workspaceRoot();
    if (!root) {
      post({ error: 'No workspace folder open', rules: [], otherFiles: [] });
      return;
    }
    post({ rules: listItems(root), otherFiles: collectOtherFiles(root) });
  } catch (e) {
    post({
      error: e instanceof Error ? e.message : String(e),
      rules: [],
      otherFiles: [],
    });
  }
}

export async function handleRulesLoad(
  webview: vscode.Webview | undefined,
  requestId: string,
  id: string
): Promise<void> {
  const post = (payload: Record<string, unknown>) => {
    void webview?.postMessage({ type: 'rules.loaded', requestId, ...payload });
  };

  try {
    const root = workspaceRoot();
    if (!root) {
      post({ error: 'No workspace folder open', content: '', exists: false });
      return;
    }
    const resolved = resolveRuleId(root, id);
    if (!resolved) {
      post({ error: 'Invalid rule id', content: '', exists: false });
      return;
    }
    const fallback =
      resolved.kind === 'basic' ? '기본 룰' : path.parse(resolved.fileName).name;
    const { title, exists, content } = readTitle(resolved.abs, fallback);
    post({
      id: resolved.relPath,
      content,
      path: resolved.abs,
      exists,
      kind: resolved.kind,
      title,
      fileName: resolved.fileName,
    });
  } catch (e) {
    post({
      error: e instanceof Error ? e.message : String(e),
      content: '',
      exists: false,
    });
  }
}

export async function handleRulesSave(
  webview: vscode.Webview | undefined,
  requestId: string,
  id: string,
  content: string
): Promise<void> {
  const post = (payload: Record<string, unknown>) => {
    void webview?.postMessage({ type: 'rules.saved', requestId, ...payload });
  };

  try {
    const root = workspaceRoot();
    if (!root) {
      post({ ok: false, error: 'No workspace folder open' });
      return;
    }
    const resolved = resolveRuleId(root, id);
    if (!resolved) {
      post({ ok: false, error: 'Invalid rule id' });
      return;
    }
    if (resolved.kind === 'custom') {
      fs.mkdirSync(path.dirname(resolved.abs), { recursive: true });
    }
    fs.writeFileSync(resolved.abs, content ?? '', 'utf-8');
    invalidateProjectRulesCache(root);
    const fallback =
      resolved.kind === 'basic' ? '기본 룰' : path.parse(resolved.fileName).name;
    post({
      ok: true,
      id: resolved.relPath,
      path: resolved.abs,
      title: titleFromRuleContent(content ?? '', fallback),
    });
  } catch (e) {
    post({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function handleRulesCreate(
  webview: vscode.Webview | undefined,
  requestId: string,
  title: string
): Promise<void> {
  const post = (payload: Record<string, unknown>) => {
    void webview?.postMessage({ type: 'rules.created', requestId, ...payload });
  };

  try {
    const root = workspaceRoot();
    if (!root) {
      post({ ok: false, error: 'No workspace folder open' });
      return;
    }
    const dir = path.join(root, AGENTK_DIR, 'rules');
    fs.mkdirSync(dir, { recursive: true });
    const fileName = uniqueCustomFileName(dir, title);
    const abs = path.join(dir, fileName);
    const heading = (title || '').trim() || path.parse(fileName).name;
    const content = `# ${heading}\n\n`;
    fs.writeFileSync(abs, content, 'utf-8');
    invalidateProjectRulesCache(root);
    const relPath = posixJoin(PROJECT_CUSTOM_RULES_DIR, fileName);
    post({
      ok: true,
      content,
      rule: {
        id: relPath,
        kind: 'custom',
        fileName,
        title: heading,
        path: abs,
        exists: true,
      } satisfies RuleListItem,
    });
  } catch (e) {
    post({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function handleRulesDelete(
  webview: vscode.Webview | undefined,
  requestId: string,
  id: string
): Promise<void> {
  const post = (payload: Record<string, unknown>) => {
    void webview?.postMessage({ type: 'rules.deleted', requestId, ...payload });
  };

  try {
    const root = workspaceRoot();
    if (!root) {
      post({ ok: false, error: 'No workspace folder open' });
      return;
    }
    const resolved = resolveRuleId(root, id);
    if (!resolved || resolved.kind !== 'custom') {
      post({ ok: false, error: 'Only custom rules in .agentk/rules can be deleted' });
      return;
    }
    if (fs.existsSync(resolved.abs)) {
      fs.unlinkSync(resolved.abs);
    }
    invalidateProjectRulesCache(root);
    post({ ok: true, id: resolved.relPath });
  } catch (e) {
    post({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
