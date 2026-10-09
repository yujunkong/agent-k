/**
 * V31-CTX-01 — Session transcript store (ISSUE-02).
 *
 * The host is the source of truth for the per-session `AgentMessage[]`.
 * Unlike the webview prior (user/assistant text only), this preserves tool
 * results, tool-call pairing and message metadata so a heavy tool turn is
 * still visible to the following send.
 *
 * STREAM-004 guardrail: this store is additive; the webview prior remains the
 * fallback when no transcript exists for the session.
 *
 * Pure host logic — no vscode import.
 */

import type { AgentMessage } from '@agent-k/core';

/** Keep transcripts bounded so long sessions do not grow without limit. */
const MAX_TRANSCRIPT_MESSAGES = 200;

export class SessionTranscriptStore {
  private readonly bySession = new Map<string, AgentMessage[]>();

  /** Existing transcript (a copy) or [] when the session is unknown. */
  get(sessionId: string): AgentMessage[] {
    const stored = this.bySession.get(sessionId);
    return stored ? [...stored] : [];
  }

  /** True when a transcript exists (even if empty). */
  has(sessionId: string): boolean {
    return this.bySession.has(sessionId);
  }

  /** Append messages, trimming the oldest when over the cap. */
  append(sessionId: string, messages: AgentMessage[]): void {
    if (!messages.length) return;
    const current = this.bySession.get(sessionId) ?? [];
    const next = [...current, ...messages];
    this.bySession.set(
      sessionId,
      next.length > MAX_TRANSCRIPT_MESSAGES
        ? next.slice(next.length - MAX_TRANSCRIPT_MESSAGES)
        : next
    );
  }

  /** Replace the whole transcript (e.g. after compaction), keeping the newest cap. */
  replace(sessionId: string, messages: AgentMessage[]): void {
    const next = [...messages];
    this.bySession.set(
      sessionId,
      next.length > MAX_TRANSCRIPT_MESSAGES
        ? next.slice(next.length - MAX_TRANSCRIPT_MESSAGES)
        : next
    );
  }

  clear(sessionId: string): void {
    this.bySession.delete(sessionId);
  }
}

/** Shared singleton for extension wiring (tests may use fresh instances). */
export const sessionTranscriptStore = new SessionTranscriptStore();
