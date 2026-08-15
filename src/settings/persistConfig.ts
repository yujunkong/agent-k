/**
 * Persist flat agent-k.* values to extension host (VS Code configuration).
 * Mirrors ModelsTab pattern so Permission / Features / Queue stay in sync.
 */
export function persistToHost(values: Record<string, unknown>): void {
    try {
      const vscodeApi =
        (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      if (vscodeApi?.postMessage) {
        vscodeApi.postMessage({ type: 'config.update', values });
        return;
      }
    } catch {
      /* ignore */
    }
    window.parent.postMessage({ type: 'config.update', values }, '*');
  }
  