/**
 * VS Code webview API accessor — one place for ChatApp host postMessage.
 */
export interface VsCodeApi {
  postMessage: (msg: unknown) => void;
}

export function getVsCodeApi(): VsCodeApi | null {
  try {
    const api =
      (window as unknown as { __vscodeApi?: VsCodeApi; acquireVsCodeApi?: () => VsCodeApi })
        .__vscodeApi ||
      (window as unknown as { acquireVsCodeApi?: () => VsCodeApi }).acquireVsCodeApi?.();
    return api?.postMessage ? api : null;
  } catch {
    return null;
  }
}
