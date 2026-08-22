/**
 * AGENT-016 / REL-001 — ClassifierDiagnostics ring buffer.
 * Observes classifier outcomes without changing control flow.
 */

import { CLASSIFIER_FNS, type ClassifierFnName } from './classifiers';

export interface ClassifyEvent {
  fn: ClassifierFnName;
  result: boolean;
  /** First 160 chars — diagnostics only, not a transcript. */
  sample: string;
  turn?: number;
  at: number;
}

export type ClassifyListener = (event: ClassifyEvent) => void;

/**
 * Ring buffer of recent classifier results + optional observer hook.
 */
export class ClassifierDiagnostics {
  private readonly capacity: number;
  private readonly buffer: ClassifyEvent[] = [];
  private listener: ClassifyListener | null = null;
  private enabled: boolean;

  constructor(capacity = 200, enabled = true) {
    this.capacity = Math.max(1, capacity);
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  onEvent(listener: ClassifyListener | null): void {
    this.listener = listener;
  }

  /** Record one observation (no-op when disabled). */
  record(
    fn: ClassifierFnName,
    result: boolean,
    text: string,
    turn?: number
  ): void {
    if (!this.enabled) return;
    const event: ClassifyEvent = {
      fn,
      result,
      sample: (text || '').slice(0, 160),
      turn,
      at: Date.now(),
    };
    this.buffer.push(event);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    try {
      this.listener?.(event);
    } catch {
      /* diagnostics must never break the loop */
    }
  }

  /** Run classifier + record (AGENT-016 wrapper). */
  run(fn: ClassifierFnName, text: string, turn?: number): boolean {
    const result = CLASSIFIER_FNS[fn](text);
    this.record(fn, result, text, turn);
    return result;
  }

  recent(limit = 50): ClassifyEvent[] {
    return this.buffer.slice(-limit);
  }

  clear(): void {
    this.buffer.length = 0;
  }

  get size(): number {
    return this.buffer.length;
  }
}
