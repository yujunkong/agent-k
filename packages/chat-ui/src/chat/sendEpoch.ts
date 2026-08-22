/**
 * STREAM-003 — Per-tab send epoch (chat-ui / 표시·webview).
 *
 * Stop / resynth / a second tab's send used to increment one global counter.
 * The first tab's stream then treated every delta as stale and froze
 * ("먹통") even though the host loop was still running.
 *
 * Runtime twin: `packages/core` REL-005 (`SendEpochMap`) — already [x].
 * This module is what ChatApp / useChatSendFlow actually import.
 */
import { debugLog } from './debugLog';

type CounterLog = { channel: string; event: string };

export class SendEpochMap {
  private readonly epochs = new Map<string, number>();

  protected bumpLog(): CounterLog {
    return { channel: 'tab-stream', event: 'epoch.bump' };
  }

  /** Bump one session only. Returns the new epoch for that session. */
  bump(sessionId: string): number {
    const id = String(sessionId || '');
    const next = (this.epochs.get(id) || 0) + 1;
    this.epochs.set(id, next);
    const log = this.bumpLog();
    debugLog(log.channel, log.event, { sessionId: id, value: next });
    return next;
  }

  get(sessionId: string): number {
    return this.epochs.get(String(sessionId || '')) || 0;
  }

  /** True when this turn was superseded on the same session (not another tab). */
  isStale(sessionId: string, epoch: number): boolean {
    return epoch !== this.get(sessionId);
  }

  clear(sessionId: string): void {
    const id = String(sessionId || '');
    this.epochs.delete(id);
    debugLog('tab-stream', 'epoch.clear', { sessionId: id });
  }
}

/**
 * Per-tab agent-loop turn counter (Thought / tool timeline `turn`).
 * Must not share a single integer across parallel session streams.
 */
export class SessionTurnMap extends SendEpochMap {
  protected bumpLog(): CounterLog {
    return { channel: 'timeline-order', event: 'turn.bump' };
  }
}

/**
 * Per-tab step start timestamps — clearing one tab must not wipe another's.
 */
export class SessionStepStartMap {
  private readonly bySession = new Map<string, Record<string, number>>();

  /** Replace bag for one session (start of a new send on that tab). */
  reset(sessionId: string): void {
    const id = String(sessionId || '');
    this.bySession.set(id, {});
    debugLog('timeline-order', 'stepStart.reset', {
      sessionId: id,
      openSessions: [...this.bySession.keys()]
    });
  }

  /** Drop one session's bag (tab delete). */
  clear(sessionId: string): void {
    const id = String(sessionId || '');
    this.bySession.delete(id);
    debugLog('timeline-order', 'stepStart.clear', {
      sessionId: id,
      openSessions: [...this.bySession.keys()]
    });
  }

  /** Mutable bag for this session — create empty if missing. */
  bag(sessionId: string): Record<string, number> {
    const id = String(sessionId || '');
    let cur = this.bySession.get(id);
    if (!cur) {
      cur = {};
      this.bySession.set(id, cur);
      debugLog('timeline-order', 'stepStart.bag-create', { sessionId: id });
    }
    return cur;
  }
}
