/**
 * V31-RETRY-01 — FailureTracker.
 *
 * Tracks tool failures keyed by tool + args so the loop can retry a failed
 * tool a bounded number of times. A change to the arguments starts a fresh
 * budget (`isDeltaRetry`) — the model fixed its call, so it deserves another
 * shot rather than an immediate stop.
 */

export interface FailureFingerprint {
  toolName: string;
  argsHash: string;
  errorSig: string;
}

export interface FailureRecord extends FailureFingerprint {
  attempts: number;
  firstAt: number;
  lastAt: number;
  argsChanged: boolean;
}

/** Stable key for tool+args (error excluded so a delta retry is detectable). */
function callKey(toolName: string, argsHash: string): string {
  return `${toolName}\u0000${argsHash}`;
}

function hashArgs(args: Record<string, unknown>): string {
  const simplified: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args || {})) {
    simplified[key] = typeof value === 'string' && value.length > 100
      ? value.slice(0, 100)
      : value;
  }
  return JSON.stringify(simplified);
}

function errorSignature(error: string): string {
  const m = error.match(/(line \d+|:\d+:\d+|Error: .+|error .+|Path escapes)/i);
  return m ? m[1]! : error.slice(0, 200);
}

export class FailureTracker {
  constructor(private readonly maxAttempts = 3) {}

  private readonly records = new Map<string, FailureRecord>();

  /** Record an attempt; returns the updated record. */
  record(
    toolName: string,
    args: Record<string, unknown>,
    error: string,
    now = Date.now()
  ): FailureRecord {
    const argsHash = hashArgs(args);
    const key = callKey(toolName, argsHash);
    const existing = this.records.get(key);
    if (existing) {
      existing.attempts += 1;
      existing.lastAt = now;
      existing.errorSig = errorSignature(error);
      return { ...existing };
    }
    const record: FailureRecord = {
      toolName,
      argsHash,
      errorSig: errorSignature(error),
      attempts: 1,
      firstAt: now,
      lastAt: now,
      argsChanged: false,
    };
    this.records.set(key, record);
    return { ...record };
  }

  attemptsFor(fp: Pick<FailureFingerprint, 'toolName' | 'argsHash'>): number {
    return this.records.get(callKey(fp.toolName, fp.argsHash))?.attempts ?? 0;
  }

  isExhausted(fp: Pick<FailureFingerprint, 'toolName' | 'argsHash'>): boolean {
    return this.attemptsFor(fp) >= this.maxAttempts;
  }

  /**
   * True when this tool failed before but with different args — i.e. the model
   * changed its call, so a new attempt budget applies.
   */
  isDeltaRetry(toolName: string, args: Record<string, unknown>): boolean {
    const argsHash = hashArgs(args);
    for (const record of this.records.values()) {
      if (record.toolName === toolName && record.argsHash !== argsHash) return true;
    }
    return false;
  }

  reset(): void {
    this.records.clear();
  }

  clearTool(toolName: string): void {
    for (const key of [...this.records.keys()]) {
      if (key.startsWith(`${toolName}\u0000`)) this.records.delete(key);
    }
  }
}
