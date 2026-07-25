/**
 * DoomLoopDetector - 연속 동일 실패 감지 (C3-T04)
 * 
 * (toolName, argsHash, errorSig) 지문 → N회(3) 반복 감지
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

  record(toolName: string, args: Record<string, any>, error: string): void {
    this.history.push({
      toolName,
      argsHash: this.hashArgs(args),
      errorSig: this.extractErrorSignature(error)
    });

    // Keep only recent history (last 20)
    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }
  }

  isDoomLoop(): boolean {
    if (this.history.length < this.threshold) return false;

    const recent = this.history.slice(-this.threshold);
    const first = recent[0];

    return recent.every(h =>
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

  private hashArgs(args: Record<string, any>): string {
    const simplified: Record<string, any> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string' && value.length > 100) {
        simplified[key] = value.slice(0, 100); // truncate long strings
      } else {
        simplified[key] = value;
      }
    }
    return JSON.stringify(simplified);
  }

  private extractErrorSignature(error: string): string {
    // Extract meaningful part of error (file paths, line numbers, error codes)
    const lineMatch = error.match(/(line \d+|:\d+:\d+|Error: .+|error .+)/i);
    return lineMatch ? lineMatch[1] : error.slice(0, 200);
  }
}
