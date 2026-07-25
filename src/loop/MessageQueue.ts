/**
 * MessageQueue - Interrupt & Resynthesize + Queue-only (C3-T07/C4-T21)
 * 
 * Enter → Interrupt & Resynthesize
 * Alt+Enter → Queue-only
 * Debounce 300ms + running lock
 */
export type QueueAction = 'resynthesize' | 'queue_only';

export interface QueuedMessage {
  id: string;
  text: string;
  action: QueueAction;
  timestamp: number;
  status: 'queued' | 'processing' | 'completed' | 'interrupted';
}

export interface MessageQueueState {
  messages: QueuedMessage[];
  isProcessing: boolean;
  isInterrupted: boolean;
}

export type QueueListener = (state: MessageQueueState) => void;

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private _isProcessing = false;
  private _isInterrupted = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;
  private listeners: Set<QueueListener> = new Set();
  private onProcess: ((message: QueuedMessage) => Promise<void>) | null = null;

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
  }

  get state(): MessageQueueState {
    return {
      messages: [...this.queue],
      isProcessing: this._isProcessing,
      isInterrupted: this._isInterrupted
    };
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setHandler(handler: (message: QueuedMessage) => Promise<void>): void {
    this.onProcess = handler;
  }

  enqueue(text: string, action: QueueAction): QueuedMessage {
    const message: QueuedMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      action,
      timestamp: Date.now(),
      status: 'queued'
    };

    this.queue.push(message);
    this.notify();

    if (action === 'resynthesize') {
      // Interrupt current processing and resynthesize
      this._isInterrupted = true;
      this.scheduleProcess();
    }

    return message;
  }

  private scheduleProcess(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processNext();
    }, this.debounceMs);
  }

  private async processNext(): Promise<void> {
    if (this._isProcessing || !this.onProcess) return;

    const next = this.queue.find(m => m.status === 'queued');
    if (!next) return;

    this._isProcessing = true;
    this._isInterrupted = false;
    next.status = 'processing';
    this.notify();

    try {
      await this.onProcess(next);
      next.status = 'completed';
    } catch (error) {
      next.status = 'interrupted';
    } finally {
      this._isProcessing = false;
      this.notify();
    }

    // Process next if any
    const remaining = this.queue.find(m => m.status === 'queued');
    if (remaining && !this._isInterrupted) {
      this.scheduleProcess();
    }
  }

  cancelQueued(): void {
    this.queue.forEach(m => {
      if (m.status === 'queued') {
        m.status = 'interrupted';
      }
    });
    this._isInterrupted = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.notify();
  }

  /**
   * RW-P0-04: Apply now — promote a queued message to immediate resynthesize.
   * Caller must abort + resynthesize; this only marks action and clears debounce.
   */
  applyNow(messageId: string): QueuedMessage | null {
    const msg = this.queue.find(m => m.id === messageId && m.status === 'queued');
    if (!msg) return null;
    msg.action = 'resynthesize';
    msg.status = 'processing';
    this._isInterrupted = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.notify();
    return msg;
  }

  /**
   * Drain all queued texts (Apply now empty-input path / resynth batch).
   * Returns texts in enqueue order; marks those items completed.
   */
  drain(): string[] {
    const texts: string[] = [];
    for (const m of this.queue) {
      if (m.status === 'queued') {
        texts.push(m.text);
        m.status = 'completed';
      }
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.notify();
    return texts;
  }

  /** Active queued messages (for QueueUI). */
  getQueued(): QueuedMessage[] {
    return this.queue.filter(m => m.status === 'queued' || m.status === 'processing');
  }

  clear(): void {
    this.queue = [];
    this._isInterrupted = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.notify();
  }

  private notify(): void {
    const state = this.state;
    this.listeners.forEach(l => l(state));
  }
}
