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

  /**
   * Cancel one queued message (or all if id omitted for legacy).
   */
  cancelQueued(messageId?: string): void {
    if (messageId) {
      const msg = this.queue.find((m) => m.id === messageId && m.status === 'queued');
      if (msg) {
        msg.status = 'interrupted';
        this.notify();
      }
      return;
    }
    this.queue.forEach((m) => {
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
   * Apply now — take ONE queued message out for immediate resynthesize.
   * Leaves other queued items untouched (do not drain).
   */
  take(messageId: string): QueuedMessage | null {
    const idx = this.queue.findIndex(
      (m) => m.id === messageId && m.status === 'queued'
    );
    if (idx < 0) return null;
    const msg = this.queue[idx];
    msg.action = 'resynthesize';
    msg.status = 'completed';
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.notify();
    return { ...msg };
  }

  /**
   * @deprecated use take() — applyNow left items stuck in "processing"
   */
  applyNow(messageId: string): QueuedMessage | null {
    return this.take(messageId);
  }

  /**
   * Drain all queued texts (Enter interrupt batch / idle flush).
   * Only status === 'queued' — never touches in-flight or completed.
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
    return this.queue.filter((m) => m.status === 'queued');
  }

  /** Drop completed/interrupted history so the list stays small. */
  pruneSettled(): void {
    this.queue = this.queue.filter((m) => m.status === 'queued');
    this.notify();
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
