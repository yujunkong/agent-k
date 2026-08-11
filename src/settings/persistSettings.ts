/**
 * Persist settings from the webview Settings Hub to ConfigManager + extension host.
 * ModelsTab historically used a private persistToHost; all tabs should use this.
 */
import { configManager } from '../core/ConfigManager';

/** Post `config.update` to the extension host (VS Code configuration). */
export function postConfigUpdateToHost(values: Record<string, unknown>): void {
  try {
    const vscodeApi =
      (window as unknown as { __vscodeApi?: { postMessage?: (m: unknown) => void } })
        .__vscodeApi ||
      (
        window as unknown as {
          acquireVsCodeApi?: () => { postMessage?: (m: unknown) => void };
        }
      ).acquireVsCodeApi?.();
    if (vscodeApi?.postMessage) {
      vscodeApi.postMessage({ type: 'config.update', values });
      return;
    }
  } catch {
    /* ignore */
  }
  window.parent.postMessage({ type: 'config.update', values }, '*');
}

/**
 * Update in-memory ConfigManager and mirror to VS Code via host.
 * Prefer this over bare `configManager.update` / `set` in Settings tabs.
 */
export function persistSettings(values: Record<string, unknown>): void {
  configManager.update(values);
  postConfigUpdateToHost(values);
}

/** Convenience for a single key (Permission / Privacy / MCP budget). */
export function persistSetting(key: string, value: unknown): void {
  persistSettings({ [key]: value });
}
