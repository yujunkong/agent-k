/**
 * StopHandler - Stop vs Interrupt&Resynthesize 정책 분리 (RW-P1-04 / RW-P0-04)
 *
 * Stop: abort in-flight HTTP only; queue keep|discard per agent-k.queue.onStop.
 * Resynthesize: abort + drain queue + rebuild prompt (Composer/MessageQueue 경로).
 */
import type { MessageQueue } from './MessageQueue';
import { configManager } from '../core/ConfigManager';

export type StopReason = 'user_stop' | 'resynthesize' | 'error';

export interface StopHandlerDeps {
  abort: () => void;
  queue: MessageQueue;
  /** Optional: cancel shell/HTTP beyond AbortController (documented gap if unset). */
  cancelInFlight?: () => void;
}

export class StopHandler {
  constructor(private readonly deps: StopHandlerDeps) {}

  /**
   * User pressed Stop — NOT Resynthesize.
   * Respects agent-k.queue.onStop: keep (default) | discard.
   */
  stop(reason: StopReason = 'user_stop'): { keptQueue: boolean; discarded: number } {
    this.deps.abort();
    this.deps.cancelInFlight?.();

    const onStop = (configManager.get('agent-k.queue.onStop') as string) || 'keep';
    if (onStop === 'discard') {
      const before = this.deps.queue.getQueued().length;
      this.deps.queue.cancelQueued();
      return { keptQueue: false, discarded: before };
    }
    // keep: leave queued messages intact
    return { keptQueue: true, discarded: 0 };
  }

  /**
   * Interrupt for Resynthesize — always abort; queue drain is caller's job.
   */
  interruptForResynthesize(): void {
    this.deps.abort();
    this.deps.cancelInFlight?.();
  }
}
