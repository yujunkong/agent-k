import * as vscode from 'vscode';
import { configManager, AGENT_K_VSCODE_CONFIG_KEYS } from '../core/ConfigManager';
import {
  PROJECT_CONFIG_FILENAMES,
  PROJECT_CONFIG_PATH,
  exampleProjectConfig,
  parseProjectConfigJson,
  pickProjectConfigValues,
  unflattenProjectConfig,
} from '../core/ProjectConfig';
import { RuntimeServices } from '../core/RuntimeServices';

export function agentKSubKey(fullKey: string): string {
  return fullKey.replace(/^agent-k\./, '');
}

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
  uri: vscode.Uri
): Promise<{ text: string; values: Record<string, unknown> } | { error: string }> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString('utf8');
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
      `Agent K: failed to read ${uri.fsPath}: ${result.error}`
    );
    return null;
  }
  configManager.syncFromVSCode(result.values);
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
  fn: ((msg: Record<string, unknown>) => void) | undefined
): void {
  projectConfigPostToWebview = fn;
}

export function bindAgentKConfigBridge(context: vscode.ExtensionContext): void {
  configManager.bindVSCodeUpdater(async (key, value) => {
    await vscode.workspace
      .getConfiguration('agent-k')
      .update(agentKSubKey(key), value, vscode.ConfigurationTarget.Global);
  });

  configManager.syncFromVSCode(readAgentKFromVSCode());

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('agent-k')) return;
      configManager.syncFromVSCode(readAgentKFromVSCode());
      void applyProjectConfigFromDisk();
      const level = configManager.get('agent-k.permission.level') || 'accept_edits';
      RuntimeServices.getPermissionGate()?.setLevel(level);
    })
  );
}

export function bindProjectConfig(context: vscode.ExtensionContext): void {
  void applyProjectConfigFromDisk().then((values) => {
    if (values && projectConfigPostToWebview) {
      projectConfigPostToWebview({ type: 'config.hydrate', values });
    }
  });

  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/{.agentk/settings.json,.agent-k/settings.json,.agent-k.json,agent-k.json}'
  );
  const reload = () => {
    void (async () => {
      configManager.syncFromVSCode(readAgentKFromVSCode());
      const values = await applyProjectConfigFromDisk();
      if (values && projectConfigPostToWebview) {
        projectConfigPostToWebview({ type: 'config.hydrate', values });
      }
      const level = configManager.get('agent-k.permission.level') || 'accept_edits';
      RuntimeServices.getPermissionGate()?.setLevel(level);
    })();
  };
  watcher.onDidCreate(reload);
  watcher.onDidChange(reload);
  watcher.onDidDelete(() => {
    configManager.syncFromVSCode(readAgentKFromVSCode());
    if (projectConfigPostToWebview) {
      projectConfigPostToWebview({
        type: 'config.hydrate',
        values: readAgentKFromVSCode(),
      });
    }
  });
  context.subscriptions.push(watcher);
}

export {
  exampleProjectConfig,
  parseProjectConfigJson,
  pickProjectConfigValues,
  unflattenProjectConfig,
};
