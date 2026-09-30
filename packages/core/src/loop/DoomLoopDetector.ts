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
  private readonly detectAlternation: boolean;
  private readonly ignoreArgsOnSameError: boolean;

  constructor(
    threshold = 3,
    opts: { detectAlternation?: boolean; ignoreArgsOnSameError?: boolean } = {}
  ) {
    this.threshold = Math.max(2, threshold);
    this.detectAlternation = opts.detectAlternation ?? false;
    this.ignoreArgsOnSameError = opts.ignoreArgsOnSameError ?? false;
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

    // V31-RETRY-03 — same tool failing with the SAME error signature is a doom
    // loop even when args drift slightly (ignoreArgsOnSameError).
    if (this.ignoreArgsOnSameError) {
      const recent = this.history.slice(-this.threshold);
      const first = recent[0]!;
      if (
        first.outcomeSig !== 'ok' &&
        recent.every(
          (h) => h.toolName === first.toolName && h.outcomeSig === first.outcomeSig
        )
      ) {
        return true;
      }
    }

    // V31-RETRY-03 — alternating A/B/A/B with identical args is also a loop.
    if (this.detectAlternation && this.history.length >= 4) {
      const window = this.history.slice(-4);
      const names = window.map((h) => h.toolName);
      const alternating = names[0] === names[2] && names[1] === names[3];
      if (alternating && names[0] !== names[1]) {
        const argsA = window[0]!.argsHash;
        const argsB = window[1]!.argsHash;
        if (window[2]!.argsHash === argsA && window[3]!.argsHash === argsB) {
          return true;
        }
      }
    }

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
