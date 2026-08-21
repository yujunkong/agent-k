/**
 * SHARED-001 / SHARED-002 — chat.stream envelope.
 * Discriminated by `event` so UI never string-guesses tool/edit kinds (R-002).
 */

import type { RequestId } from '../common/ids';
import type { TypedWorkEvent } from '../work-events/events';
import type { FileEditPayload } from '../work-events/file-edit';
import type { TerminalRunPayload } from '../work-events/terminal-run';

/** Host → Webview stream events for a single chat.send request. */
export type ChatStreamEvent =
  | { event: 'heartbeat' }
  | { event: 'status'; status: string }
  | { event: 'delta'; content?: string; reasoning?: string }
  | {
      event: 'tool.start';
      toolName: string;
      turn?: number;
      toolArgs?: string;
    }
  | {
      event: 'tool.end';
      toolName?: string;
      toolResult?: string;
      error?: string;
    }
  /** R-002 hinge: timeline carries a Typed Work Event, not free-form strings. */
  | { event: 'timeline'; workEvent: TypedWorkEvent }
  | { event: 'file.edit'; edit: FileEditPayload }
  | { event: 'terminal.run'; run: TerminalRunPayload }
  | {
      event: 'ask_question';
      qid: string;
      question: string;
      options?: string[];
      required?: boolean;
      allowMultiple?: boolean;
    }
  | { event: 'debug.stage'; stage: string }
  | { event: 'complete' }
  | { event: 'stopped' }
  | { event: 'error'; error: string };

/** Full host→webview stream message body (type added at ProtocolMessage layer). */
export type ChatStreamEnvelope = { requestId: RequestId } & ChatStreamEvent;
