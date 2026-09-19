/**
 * SET-011 — Settings → Rules tab host handlers (v2.1 rulesHostHandlers parity).
 *
 * Messages: rules.list / rules.load / rules.save / rules.create / rules.delete
 * Responses: rules.listed / rules.loaded / rules.saved / rules.created / rules.deleted
 *
 * Cursor rules (`.cursor/rules/*`) are injected by the agent but not listed
 * here — the Rules tab owns basic `.agentrules` + custom `.agentk/rules/*`.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { RuleListItem } from '@agent-k/shared';
import {
  AGENTK_DIR,
  DEFAULT_RULES_FILE,
  PROJECT_CUSTOM_RULES_DIR,
  PROJECT_RULES_FILES,
  invalidateProjectRulesCache,
  listProjectRuleFiles,
  titleFromRuleContent,
} from '@agent-k/core';
import { resolveRuleId, uniqueCustomFileName } from './rulesHostPure';

export { DEFAULT_RULES_FILE };

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function readTitle(
  abs: string,
  fallback: string,
): { title: string; exists: boolean; content: string } {
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
  return listProjectRuleFiles(root)
    .filter((file) => file.kind !== 'cursor')
    .map((file) => {
      const abs = path.join(root, ...file.relPath.split('/'));
      const fallback =
        file.kind === 'basic' ? '기본 룰' : path.parse(file.fileName).name;
      const { title, exists } = readTitle(abs, fallback);
      return {
        id: file.relPath,
        kind: file.kind === 'basic' ? 'basic' : 'custom',
        fileName: file.fileName,
        title,
        path: abs,
        exists,
      };
    });
}

export async function handleRulesList(
  webview: vscode.Webview | undefined,
  requestId: string,
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
  id: string,
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
  content: string,
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
  title: string,
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
    const fileName = uniqueCustomFileName(
      (name) => fs.existsSync(path.join(dir, name)),
      title,
    );
    const abs = path.join(dir, fileName);
    const heading = (title || '').trim() || path.parse(fileName).name;
    const content = `# ${heading}\n\n`;
    fs.writeFileSync(abs, content, 'utf-8');
    invalidateProjectRulesCache(root);
    const relPath = `${PROJECT_CUSTOM_RULES_DIR}/${fileName}`;
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
  id: string,
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
