/**
 * DoomLoopDetector - 동일 도구+인자 반복 감지 (C3-T04 / HARB)
 *
 * Success 또는 failure 모두: (toolName, argsHash, outcomeSig) 가 N회 연속이면 doom.
 * 예: 같은 path로 read_file 3회 → 중단 (성공 루프 포함)
 */
interface Fingerprint {
  toolName: string;
  argsHash: string;
  errorSig: string;
}

export class DoomLoopDetector {
  private history: Fingerprint[] = [];
  private readonly threshold: number;

  constructor(threshold = 3) {
    this.threshold = threshold;
  }

  /** Legacy: failure-only recording */
  record(toolName: string, args: Record<string, any>, error: string): void {
    this.recordCall(toolName, args, error || 'error');
  }

  /**
   * Record any tool invocation. Use outcome `'ok'` for success so identical
   * successful reads (TipTapEditor × N) are still caught.
   */
  recordCall(toolName: string, args: Record<string, any>, outcome: string): void {
    this.history.push({
      toolName,
      argsHash: this.hashArgs(this.normalizeArgs(args)),
      errorSig: outcome === 'ok' ? 'ok' : this.extractErrorSignature(outcome)
    });

    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }
  }

  isDoomLoop(): boolean {
    if (this.history.length < this.threshold) return false;

    const recent = this.history.slice(-this.threshold);
    const first = recent[0];

    return recent.every(
      (h) =>
        h.toolName === first.toolName &&
        h.argsHash === first.argsHash &&
        h.errorSig === first.errorSig
    );
  }

  getLoopInfo(): { toolName: string; count: number; lastError: string } | null {
    if (!this.isDoomLoop()) return null;
    const recent = this.history.slice(-this.threshold);
    return {
      toolName: recent[0].toolName,
      count: this.threshold,
      lastError: recent[recent.length - 1].errorSig
    };
  }

  reset(): void {
    this.history = [];
  }

  /** Normalize path-like keys so /a/b and /a//b hash the same */
  private normalizeArgs(args: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
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

  private hashArgs(args: Record<string, any>): string {
    const simplified: Record<string, any> = {};
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
    const lineMatch = error.match(/(line \d+|:\d+:\d+|Error: .+|error .+|Path escapes)/i);
    return lineMatch ? lineMatch[1] : error.slice(0, 200);
  }
}
