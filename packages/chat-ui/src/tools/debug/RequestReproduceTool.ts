/**
 * RequestReproduceTool - 사용자 재현 대기 도구 (C6-T07 / RW-C6-05-R2)
 *
 * 착각 금지: 즉시 success 금지. RuntimeServices.waitForReproduce + ReproduceUI 마운트까지 대기.
 */
import type { ToolInput, ToolOutput } from '../types';
import { RuntimeServices } from '../../core/RuntimeServices';

export interface ReproduceRequest {
  hypothesisId: string;
  steps: string[];
  timeout?: number;
  hypothesisTitle?: string;
  whatToLookFor?: string;
}

export class RequestReproduceTool {
  private pendingRequest: ReproduceRequest | null = null;
  private onPending: ((req: ReproduceRequest) => void) | null = null;

  onPendingCallback(cb: (req: ReproduceRequest) => void): void {
    this.onPending = cb;
  }

  /** Build guide markdown for the user */
  request(options: ReproduceRequest): string {
    this.pendingRequest = options;
    return [
      '## 🔄 Please Reproduce the Issue',
      '',
      'Follow these steps to help identify the bug:',
      '',
      ...options.steps.map((s, i) => `${i + 1}. ${s}`),
      '',
      `**Hypothesis**: ${options.hypothesisId}`,
      ...(options.whatToLookFor ? ['', `**Look for**: ${options.whatToLookFor}`] : []),
      '',
      'Once you have completed the steps, confirm by clicking "Reproduced".',
      `_(Timeout: ${(options.timeout || 300000) / 1000}s)_`
    ].join('\n');
  }

  /**
   * RW-C6-05-R2: Block until ReproduceUI confirm / cancel / timeout.
   * Never returns instant success.
   */
  async execute(input: ToolInput): Promise<ToolOutput> {
    const stepsRaw = input.steps;
    const steps: string[] = Array.isArray(stepsRaw)
      ? (stepsRaw as string[])
      : String(stepsRaw || 'Follow the steps to reproduce the issue.').split('\n').map(s => s.trim()).filter(Boolean);

    const timeout = typeof input.timeout === 'number'
      ? (input.timeout as number)
      : typeof input.timeoutMs === 'number'
        ? (input.timeoutMs as number)
        : 300_000;

    const hypothesisId = String(input.hypothesisId || 'unknown');
    const request: ReproduceRequest = {
      hypothesisId,
      hypothesisTitle: String(input.hypothesisTitle || hypothesisId),
      steps,
      whatToLookFor: input.whatToLookFor ? String(input.whatToLookFor) : undefined,
      timeout
    };

    const guide = this.request(request);
    this.onPending?.(request);

    try {
      // ChatApp polls isReproducePending() and mounts ReproduceUI
      const confirmed = await RuntimeServices.waitForReproduce(timeout);
      if (!confirmed) {
        this.cancel();
        return {
          success: false,
          error: 'User cancelled reproduce',
          data: { guide, hypothesisId, reproduced: false, status: 'cancelled' }
        };
      }
      this.confirmReproduced();
      return {
        success: true,
        data: {
          message: 'User confirmed reproduction',
          hypothesisId,
          guide,
          reproduced: true,
          status: 'reproduced'
        }
      };
    } catch (err: any) {
      this.cancel();
      const timedOut = String(err?.message || '').toLowerCase().includes('timed out');
      return {
        success: false,
        error: err?.message || 'Reproduce wait failed',
        data: {
          guide,
          hypothesisId,
          reproduced: false,
          status: timedOut ? 'timeout' : 'cancelled'
        }
      };
    }
  }

  confirmReproduced(): { success: boolean; request: ReproduceRequest | null } {
    if (!this.pendingRequest) return { success: false, request: null };
    const req = this.pendingRequest;
    this.pendingRequest = null;
    return { success: true, request: req };
  }

  isPending(): boolean {
    return this.pendingRequest !== null || RuntimeServices.isReproducePending();
  }

  cancel(): void {
    this.pendingRequest = null;
  }

  getPending(): ReproduceRequest | null {
    return this.pendingRequest;
  }
}

/** Singleton shared by AgentLoop + ChatApp */
export const requestReproduceTool = new RequestReproduceTool();
