/**
 * HOST-005 — Project config message handlers (.agentk/settings.json).
 */

import * as vscode from 'vscode';
import {
  applyProjectConfigFromDisk,
  ensureProjectConfigDir,
  exampleProjectConfig,
  findProjectConfigUri,
  hostConfigStore,
  parseProjectConfigJson,
  pickProjectConfigValues,
  preferredProjectConfigUri,
  readAgentKFromVSCode,
  readProjectConfigFile,
  unflattenProjectConfig,
} from './configBridge';

/** Push effective config values into webview. */
export function sendConfigHydrate(webview: vscode.Webview | undefined): void {
  if (!webview) return;
  hostConfigStore.syncFromVSCode(readAgentKFromVSCode());
  void applyProjectConfigFromDisk().finally(() => {
    void webview.postMessage({
      type: 'config.hydrate',
      values: hostConfigStore.getAll(),
    });
  });
}

export async function handleProjectConfigGet(
  webview: vscode.Webview | undefined,
): Promise<void> {
  if (!webview) return;
  const uri = await findProjectConfigUri();
  if (!uri) {
    const nested = unflattenProjectConfig(
      pickProjectConfigValues(hostConfigStore.getAll()),
    );
    void webview.postMessage({
      type: 'config.project.result',
      exists: false,
      path: preferredProjectConfigUri()?.fsPath ?? null,
      text: JSON.stringify(nested, null, 2),
    });
    return;
  }
  const result = await readProjectConfigFile(uri);
  if ('error' in result) {
    void webview.postMessage({
      type: 'config.project.result',
      exists: true,
      path: uri.fsPath,
      error: result.error,
    });
    return;
  }
  void webview.postMessage({
    type: 'config.project.result',
    exists: true,
    path: uri.fsPath,
    text: result.text,
  });
}

export async function handleProjectConfigSave(
  webview: vscode.Webview | undefined,
  text: string,
): Promise<void> {
  if (!webview) return;
  const parsed = parseProjectConfigJson(text);
  if (!parsed.ok) {
    void vscode.window.showErrorMessage(`Agent K: invalid project config — ${parsed.error}`);
    return;
  }
  const uri = preferredProjectConfigUri();
  if (!uri) {
    void vscode.window.showWarningMessage('Agent K: open a workspace folder first.');
    return;
  }
  await ensureProjectConfigDir(uri);
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
  hostConfigStore.syncFromVSCode(parsed.values);
  void webview.postMessage({ type: 'config.project.saved', path: uri.fsPath });
  sendConfigHydrate(webview);
}

export async function handleProjectConfigOpen(): Promise<void> {
  const uri = (await findProjectConfigUri()) ?? preferredProjectConfigUri();
  if (!uri) {
    void vscode.window.showWarningMessage('Agent K: open a workspace folder first.');
    return;
  }
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    await ensureProjectConfigDir(uri);
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode(exampleProjectConfig()),
    );
  }
  await vscode.window.showTextDocument(uri);
}

export async function handleProjectConfigCreateExample(
  webview: vscode.Webview | undefined,
): Promise<void> {
  const uri = preferredProjectConfigUri();
  if (!uri) {
    void vscode.window.showWarningMessage('Agent K: open a workspace folder first.');
    return;
  }
  await ensureProjectConfigDir(uri);
  await vscode.workspace.fs.writeFile(
    uri,
    new TextEncoder().encode(exampleProjectConfig()),
  );
  void vscode.window.showInformationMessage(`Agent K: wrote ${uri.fsPath}`);
  if (webview) sendConfigHydrate(webview);
}

/** Apply a single config.update from webview (Global settings). */
export async function handleConfigUpdate(key: string, value: unknown): Promise<void> {
  const fullKey = key.startsWith('agent-k.') ? key : `agent-k.${key}`;
  hostConfigStore.set(fullKey, value);
  await vscode.workspace
    .getConfiguration('agent-k')
    .update(agentKSubKeySafe(fullKey), value, vscode.ConfigurationTarget.Global);
}

/** Batch config.update `{ values }` from Settings / Composer (v2.1 shape). */
export async function handleConfigUpdateBatch(
  values: Record<string, unknown>,
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await handleConfigUpdate(key, value);
  }
}

function agentKSubKeySafe(fullKey: string): string {
  return fullKey.replace(/^agent-k\./, '');
}
