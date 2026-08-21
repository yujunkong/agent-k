/**
 * HOST-004 — VS Code settings ↔ host config store bridge.
 * Full ConfigManager (CFG-001) lands in @agent-k/core; host keeps a local store until then.
 */

import * as vscode from 'vscode';
import {
  exampleProjectConfig,
  flattenProjectConfig,
  parseProjectConfigJson,
  pickProjectConfigValues,
  unflattenProjectConfig,
} from './configPure';

export {
  exampleProjectConfig,
  flattenProjectConfig,
  parseProjectConfigJson,
  pickProjectConfigValues,
  unflattenProjectConfig,
} from './configPure';

/** Known agent-k.* keys mirrored from v2.1 (subset; CFG-001 expands). */
export const AGENT_K_VSCODE_CONFIG_KEYS = [
  'agent-k.provider.type',
  'agent-k.provider.baseUrl',
  'agent-k.provider.model',
  'agent-k.provider.apiKey',
  'agent-k.context.budget',
  'agent-k.permission.level',
  'agent-k.permission.denyGlobs',
  'agent-k.telemetry.statusBarEnabled',
] as const;

export const PROJECT_CONFIG_PATH = '.agentk/settings.json';
export const PROJECT_CONFIG_FILENAMES = [
  '.agentk/settings.json',
  '.agent-k/settings.json',
  '.agent-k.json',
  'agent-k.json',
] as const;

/** Strip `agent-k.` prefix for vscode.workspace.getConfiguration('agent-k'). */
export function agentKSubKey(fullKey: string): string {
  return fullKey.replace(/^agent-k\./, '');
}

/** Lightweight in-host config bag (CFG-001 replaces). */
export class HostConfigStore {
  private values: Record<string, unknown> = {};

  getAll(): Record<string, unknown> {
    return { ...this.values };
  }

  get(key: string): unknown {
    return this.values[key];
  }

  set(key: string, value: unknown): void {
    this.values[key] = value;
  }

  syncFromVSCode(incoming: Record<string, unknown>): void {
    Object.assign(this.values, incoming);
  }
}

/** Process-wide host config store (HOST-006 adjacent). */
export const hostConfigStore = new HostConfigStore();

export function readAgentKFromVSCode(): Record<string, unknown> {
  const section = vscode.workspace.getConfiguration('agent-k');
  const values: Record<string, unknown> = {};
  for (const fullKey of AGENT_K_VSCODE_CONFIG_KEYS) {
    const v = section.get(agentKSubKey(fullKey));
    if (v !== undefined) {
      values[fullKey] = v;
    }
  }
  return values;
}

export async function findProjectConfigUri(): Promise<vscode.Uri | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  for (const name of PROJECT_CONFIG_FILENAMES) {
    const uri = vscode.Uri.joinPath(folder.uri, ...name.split('/'));
    try {
      await vscode.workspace.fs.stat(uri);
      return uri;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

export async function readProjectConfigFile(
  uri: vscode.Uri,
): Promise<{ text: string; values: Record<string, unknown> } | { error: string }> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    // TextDecoder avoids Buffer/@types/node coupling in host compile.
    const text = new TextDecoder('utf8').decode(bytes);
    const parsed = parseProjectConfigJson(text);
    if (!parsed.ok) return { error: parsed.error };
    return { text, values: parsed.values };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function applyProjectConfigFromDisk(): Promise<Record<string, unknown> | null> {
  const uri = await findProjectConfigUri();
  if (!uri) return null;
  const result = await readProjectConfigFile(uri);
  if ('error' in result) {
    void vscode.window.showWarningMessage(
      `Agent K: failed to read ${uri.fsPath}: ${result.error}`,
    );
    return null;
  }
  hostConfigStore.syncFromVSCode(result.values);
  return result.values;
}

export function preferredProjectConfigUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  return vscode.Uri.joinPath(folder.uri, ...PROJECT_CONFIG_PATH.split('/'));
}

export async function ensureProjectConfigDir(fileUri: vscode.Uri): Promise<void> {
  const dir = vscode.Uri.joinPath(fileUri, '..');
  try {
    await vscode.workspace.fs.stat(dir);
  } catch {
    await vscode.workspace.fs.createDirectory(dir);
  }
}

export let projectConfigPostToWebview:
  | ((msg: Record<string, unknown>) => void)
  | undefined;

export function setProjectConfigPostToWebview(
  fn: ((msg: Record<string, unknown>) => void) | undefined,
): void {
  projectConfigPostToWebview = fn;
}

/** Bind VS Code configuration change → host store (CFG-001 later). */
export function bindAgentKConfigBridge(context: vscode.ExtensionContext): void {
  hostConfigStore.syncFromVSCode(readAgentKFromVSCode());

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('agent-k')) return;
      hostConfigStore.syncFromVSCode(readAgentKFromVSCode());
      void applyProjectConfigFromDisk();
    }),
  );
}

/** Watch project config files and hydrate webview when present. */
export function bindProjectConfig(context: vscode.ExtensionContext): void {
  void applyProjectConfigFromDisk().then((values) => {
    if (values && projectConfigPostToWebview) {
      projectConfigPostToWebview({ type: 'config.hydrate', values: hostConfigStore.getAll() });
    }
  });

  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/{.agentk/settings.json,.agent-k/settings.json,.agent-k.json,agent-k.json}',
  );
  const reload = () => {
    void (async () => {
      hostConfigStore.syncFromVSCode(readAgentKFromVSCode());
      await applyProjectConfigFromDisk();
      if (projectConfigPostToWebview) {
        projectConfigPostToWebview({
          type: 'config.hydrate',
          values: hostConfigStore.getAll(),
        });
      }
    })();
  };
  watcher.onDidCreate(reload);
  watcher.onDidChange(reload);
  watcher.onDidDelete(() => {
    hostConfigStore.syncFromVSCode(readAgentKFromVSCode());
    if (projectConfigPostToWebview) {
      projectConfigPostToWebview({
        type: 'config.hydrate',
        values: readAgentKFromVSCode(),
      });
    }
  });
  context.subscriptions.push(watcher);
}
