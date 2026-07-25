/**
 * Extension ↔ Webview 메시지 프로토콜 타입 정의
 * 
 * 모든 Extension-Webview 통신은 이 파일의 타입을 통해 이루어집니다.
 * Zod 스키마로 런타임 검증: 알 수 없는 메시지 타입 에러 로그
 */

// ─── Webview → Extension ──────────────────────────────

export interface ChatMessagePayload {
  text: string;
  files?: { type: string; path: string; content?: string }[];
}

export interface StopStreamPayload {}
export interface RegeneratePayload {}

export interface EditMessagePayload {
  id: string;
  content: string;
}

export interface DeleteMessagePayload {
  id: string;
}

export interface PinMessagePayload {
  id: string;
  pinned: boolean;
}

export interface SwitchModePayload {
  mode: 'ask' | 'agent' | 'plan' | 'debug';
}

export interface MentionRequestPayload {
  query: string;
  type: 'file' | 'folder' | 'symbol' | 'codebase';
}

export interface SettingsOpenPayload {}

export interface FocusInputPayload {}

// ─── Extension → Webview ──────────────────────────────

export interface StreamDeltaPayload {
  content?: string;
  reasoning?: string;
  done?: boolean;
  error?: string;
}

export interface StreamCompletePayload {
  messageId: string;
}

export interface StreamErrorPayload {
  messageId: string;
  error: string;
}

export interface ToolCallStartPayload {
  toolCallId: string;
  name: string;
  arguments: string;
}

export interface ToolCallEndPayload {
  toolCallId: string;
  result: string;
  error?: string;
}

export interface ToolResultPayload {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface TimelineUpdatePayload {
  turnId: string;
  status: 'thinking' | 'planning' | 'searching' | 'reading' | 'editing' | 'running' | 'browsing' | 'asking' | 'done';
  detail?: string;
}

export interface ModeChangedPayload {
  mode: 'ask' | 'agent' | 'plan' | 'debug';
}

export interface HistoryLoadedPayload {
  messages: any[];
  sessionId?: string;
}

export interface SettingsLoadedPayload {
  settings: Record<string, any>;
}

export interface MentionResultsPayload {
  query: string;
  results: { label: string; description?: string; detail?: string }[];
}

// ─── 메시지 래퍼 ──────────────────────────────────────

export type WebviewMessage =
  | { type: 'chat.message'; payload: ChatMessagePayload }
  | { type: 'stop.stream'; payload: StopStreamPayload }
  | { type: 'regenerate'; payload: RegeneratePayload }
  | { type: 'edit.message'; payload: EditMessagePayload }
  | { type: 'delete.message'; payload: DeleteMessagePayload }
  | { type: 'pin.message'; payload: PinMessagePayload }
  | { type: 'switch.mode'; payload: SwitchModePayload }
  | { type: 'mention.request'; payload: MentionRequestPayload }
  | { type: 'settings.open'; payload: SettingsOpenPayload }
  | { type: 'focus.input'; payload: FocusInputPayload };

export type ExtensionMessage =
  | { type: 'stream.delta'; payload: StreamDeltaPayload }
  | { type: 'stream.complete'; payload: StreamCompletePayload }
  | { type: 'stream.error'; payload: StreamErrorPayload }
  | { type: 'tool.call.start'; payload: ToolCallStartPayload }
  | { type: 'tool.call.end'; payload: ToolCallEndPayload }
  | { type: 'tool.result'; payload: ToolResultPayload }
  | { type: 'timeline.update'; payload: TimelineUpdatePayload }
  | { type: 'mode.changed'; payload: ModeChangedPayload }
  | { type: 'history.loaded'; payload: HistoryLoadedPayload }
  | { type: 'settings.loaded'; payload: SettingsLoadedPayload }
  | { type: 'mention.results'; payload: MentionResultsPayload }
  | { type: 'session.new'; payload?: Record<string, never> }
  | { type: 'session.clear'; payload?: Record<string, never> }
  | { type: 'mode.switch'; payload?: Record<string, never> }
  | { type: 'focus.input'; payload?: Record<string, never> };

// ─── 유틸리티 ──────────────────────────────────────────

const VALID_TYPES = new Set<string>([
  'chat.message', 'stop.stream', 'regenerate',
  'edit.message', 'delete.message', 'pin.message',
  'switch.mode', 'mention.request', 'settings.open', 'focus.input',
  'stream.delta', 'stream.complete', 'stream.error',
  'tool.call.start', 'tool.call.end', 'tool.result',
  'timeline.update', 'mode.changed', 'history.loaded',
  'settings.loaded', 'mention.results',
  'session.new', 'session.clear', 'mode.switch'
]);

export function validateMessageType(type: string): boolean {
  const valid = VALID_TYPES.has(type);
  if (!valid) {
    console.error(`[Agent K] Unknown message type: ${type}`);
  }
  return valid;
}
