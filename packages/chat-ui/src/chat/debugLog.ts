/**
 * Webview diagnostic logger — same format as host: `agent-k:[<용도>] …`
 * 용도 = why we are debugging (required). Open Webview DevTools to see.
 */

function tag(purpose: string): string {
  return `agent-k:[${purpose}]`;
}

/** @param purpose 디버깅 용도 (예: "CHAT-007 empty reply after tab switch") */
export function debugLog(purpose: string, ...args: unknown[]): void {
  console.log(tag(purpose), ...args);
}

export function debugWarn(purpose: string, ...args: unknown[]): void {
  console.warn(tag(purpose), ...args);
}

export function debugError(purpose: string, ...args: unknown[]): void {
  console.error(tag(purpose), ...args);
}
