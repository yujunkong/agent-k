/**
 * Host diagnostic logger — Output channel "Agent K".
 * Format: `agent-k:[<용도>] <message>` — 용도 = why this log exists (not a fixed label).
 * View → Output → "Agent K" (auto-shows on errors).
 */
import * as vscode from 'vscode';

let channel: vscode.OutputChannel | null = null;

export function getHostLog(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Agent K');
  }
  return channel;
}

/** Build greppable tag: agent-k:[purpose] */
function tag(purpose: string): string {
  return `agent-k:[${purpose}]`;
}

/**
 * @param purpose 디버깅 용도 (예: "CHAT-007 tab stream drop", "chat.send silent fail")
 * @param message 실제 로그 본문
 * @param show true면 Output 채널을 앞으로 가져옴
 */
export function hostLog(purpose: string, message: string, show = false): void {
  const line = `[${new Date().toISOString()}] ${tag(purpose)} ${message}`;
  const ch = getHostLog();
  ch.appendLine(line);
  if (show) ch.show(true);
  console.log(`${tag(purpose)} ${message}`);
}

export function hostLogError(
  purpose: string,
  message: string,
  err?: unknown,
): void {
  const detail =
    err instanceof Error
      ? `${err.message}\n${err.stack || ''}`
      : err != null
        ? String(err)
        : '';
  hostLog(purpose, `ERROR ${message}${detail ? `\n${detail}` : ''}`, true);
}
