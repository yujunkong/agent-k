/**
 * AGENT-010 — DoomLoopDetector: identical tool+args (+ outcome) repeated N times.
 */

interface Fingerprint {
  toolName: string;
  argsHash: string;
  outcomeSig: string;
}

export interface DoomLoopInfo {
  toolName: string;
  count: number;
  lastOutcome: string;
}

export class DoomLoopDetector {
  private history: Fingerprint[] = [];
  private readonly threshold: number;

  constructor(threshold = 3) {
    this.threshold = Math.max(2, threshold);
  }

  /** Record a tool invocation. Use outcome `'ok'` for success. */
  recordCall(
    toolName: string,
    args: Record<string, unknown>,
    outcome: string
  ): void {
    this.history.push({
      toolName,
      argsHash: this.hashArgs(this.normalizeArgs(args)),
      outcomeSig: outcome === 'ok' ? 'ok' : this.extractErrorSignature(outcome),
    });
    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }
  }

  /** Legacy failure-only API. */
  record(toolName: string, args: Record<string, unknown>, error: string): void {
    this.recordCall(toolName, args, error || 'error');
  }

  isDoomLoop(): boolean {
    if (this.history.length < this.threshold) return false;
    const recent = this.history.slice(-this.threshold);
    const first = recent[0]!;
    return recent.every(
      (h) =>
        h.toolName === first.toolName &&
        h.argsHash === first.argsHash &&
        h.outcomeSig === first.outcomeSig
    );
  }

  getLoopInfo(): DoomLoopInfo | null {
    if (!this.isDoomLoop()) return null;
    const recent = this.history.slice(-this.threshold);
    return {
      toolName: recent[0]!.toolName,
      count: this.threshold,
      lastOutcome: recent[recent.length - 1]!.outcomeSig,
    };
  }

  reset(): void {
    this.history = [];
  }

  private normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args || {})) {
      if (
        typeof value === 'string' &&
        (key === 'path' ||
          key === 'target_file' ||
          key === 'file_path' ||
          key === 'glob_pattern' ||
          key === 'pattern')
      ) {
        out[key] = value.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  private hashArgs(args: Record<string, unknown>): string {
    const simplified: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string' && value.length > 100) {
        simplified[key] = value.slice(0, 100);
      } else {
        simplified[key] = value;
      }
    }
    return JSON.stringify(simplified);
  }

  private extractErrorSignature(error: string): string {
    const lineMatch = error.match(
      /(line \d+|:\d+:\d+|Error: .+|error .+|Path escapes)/i
    );
    return lineMatch ? lineMatch[1]! : error.slice(0, 200);
  }
}
