import * as vscode from 'vscode';
import { configManager } from '../core/ConfigManager';
import {
  applyProjectConfigFromDisk,
  ensureProjectConfigDir,
  exampleProjectConfig,
  findProjectConfigUri,
  parseProjectConfigJson,
  pickProjectConfigValues,
  preferredProjectConfigUri,
  readAgentKFromVSCode,
  readProjectConfigFile,
  unflattenProjectConfig,
} from './configBridge';

/** Push effective ConfigManager values (incl. project JSON) into webview */
export function sendConfigHydrate(webview: vscode.Webview | undefined): void {
  if (!webview) return;
  // Re-read Global/User settings so provider picks survive webview remount
  configManager.syncFromVSCode(readAgentKFromVSCode());
  void applyProjectConfigFromDisk().finally(() => {
    void webview.postMessage({
      type: 'config.hydrate',
      values: configManager.getAll(),
    });
  });
}

export async function handleProjectConfigGet(webview: vscode.Webview | undefined): Promise<void> {
  if (!webview) return;
  const uri = await findProjectConfigUri();
  if (!uri) {
    const nested = unflattenProjectConfig(
      pickProjectConfigValues(configManager.getAll())
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

export async function handleProjectConfigSave(webview: vscode.Webview | undefined, text: string): Promise<void> {
  const uri = preferredProjectConfigUri() || (await findProjectConfigUri());
  if (!uri) {
    void webview?.postMessage({
      type: 'config.project.saved',
      ok: false,
      error: 'No workspace folder open.',
    });
    return;
  }
  const parsed = parseProjectConfigJson(text);
  if (!parsed.ok) {
    void webview?.postMessage({
      type: 'config.project.saved',
      ok: false,
      error: parsed.error,
    });
    return;
  }
  try {
    // Pretty-print nested form for the file
    const nested = unflattenProjectConfig(parsed.values);
    const body = Buffer.from(JSON.stringify(nested, null, 2) + '\n', 'utf8');
    await ensureProjectConfigDir(uri);
    await vscode.workspace.fs.writeFile(uri, body);
    configManager.syncFromVSCode(parsed.values);
    void webview?.postMessage({
      type: 'config.project.saved',
      ok: true,
      path: uri.fsPath,
      values: parsed.values,
    });
    void webview?.postMessage({
      type: 'config.hydrate',
      values: parsed.values,
    });
  } catch (err) {
    void webview?.postMessage({
      type: 'config.project.saved',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function handleProjectConfigOpen(): Promise<void> {
  let uri = await findProjectConfigUri();
  if (!uri) {
    uri = preferredProjectConfigUri();
    if (!uri) {
      void vscode.window.showWarningMessage('No workspace folder open.');
      return;
    }
    const nested = unflattenProjectConfig(
      pickProjectConfigValues(configManager.getAll())
    );
    await ensureProjectConfigDir(uri);
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(JSON.stringify(nested, null, 2) + '\n', 'utf8')
    );
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
}

export async function handleProjectConfigCreateExample(webview: vscode.Webview | undefined): Promise<void> {
  const uri = preferredProjectConfigUri();
  if (!uri) {
    void vscode.window.showWarningMessage('No workspace folder open.');
    return;
  }
  try {
    await vscode.workspace.fs.stat(uri);
    const overwrite = await vscode.window.showWarningMessage(
      '.agentk/settings.json already exists. Overwrite with example?',
      'Overwrite',
      'Cancel'
    );
    if (overwrite !== 'Overwrite') return;
  } catch {
    /* create new */
  }
  const body = Buffer.from(
    JSON.stringify(exampleProjectConfig(), null, 2) + '\n',
    'utf8'
  );
  await ensureProjectConfigDir(uri);
  await vscode.workspace.fs.writeFile(uri, body);
  const values = await applyProjectConfigFromDisk();
  void webview?.postMessage({
    type: 'config.project.result',
    exists: true,
    path: uri.fsPath,
    text: body.toString('utf8'),
  });
  if (values) {
    void webview?.postMessage({ type: 'config.hydrate', values });
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
}
