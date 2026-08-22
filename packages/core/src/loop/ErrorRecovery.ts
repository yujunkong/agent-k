/**
 * AGENT-011 — ErrorRecovery: classify retryable vs fatal loop errors.
 */

export type ErrorKind = 'retryable' | 'fatal' | 'cancelled';

export interface ClassifiedError {
  kind: ErrorKind;
  message: string;
  retryAfterMs?: number;
  original: unknown;
}

const RETRYABLE_PATTERNS =
  /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|429|rate.?limit|temporar|unavailable|503|502|overloaded|try again/i;

const FATAL_PATTERNS =
  /unauthorized|401|403|invalid.?api.?key|context.?length|maximum context|prompt.?too.?long|model.?not.?found|404/i;

/** Classify an unknown thrown value for loop recovery policy. */
export function classifyError(err: unknown): ClassifiedError {
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
    return { kind: 'cancelled', message: 'Aborted', original: err };
  }
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String(err ?? 'Unknown error');

  if (/abort|cancelled|canceled/i.test(message)) {
    return { kind: 'cancelled', message, original: err };
  }
  if (FATAL_PATTERNS.test(message)) {
    return { kind: 'fatal', message, original: err };
  }
  if (RETRYABLE_PATTERNS.test(message)) {
    return { kind: 'retryable', message, retryAfterMs: 500, original: err };
  }
  return { kind: 'retryable', message, retryAfterMs: 250, original: err };
}

export interface ErrorRecoveryOptions {
  maxRetries?: number;
}

/**
 * Runs an async op with limited retries for retryable errors.
 */
export class ErrorRecovery {
  private readonly maxRetries: number;

  constructor(options: ErrorRecoveryOptions = {}) {
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal?.aborted) {
        throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      }
      try {
        return await fn();
      } catch (err) {
        const classified = classifyError(err);
        if (classified.kind === 'cancelled' || classified.kind === 'fatal') {
          throw err;
        }
        if (attempt >= this.maxRetries) throw err;
        attempt++;
        const wait = classified.retryAfterMs ?? 250;
        await sleep(wait, signal);
      }
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      },
      { once: true }
    );
  });
}
