/**
 * V31-LOOP-02 — Inline self-critique runner (no extra provider call).
 * Tracks passes internally so the critique can never loop forever.
 */
import type { AgentMessage } from '../../types';
import type { CritiqueFormatter } from './CritiqueFormatter';
import type { SelfCritiquePolicy } from './SelfCritiquePolicy';

export interface CritiqueInput {
  editedPaths: string[];
  messages: AgentMessage[];
  turn: number;
}

export interface CritiqueResult {
  /** True when a critique nudge was issued. */
  pass: boolean;
  nudge?: string;
  passes: number;
}

export class CritiqueRunner {
  private passes = 0;

  constructor(
    private readonly policy: SelfCritiquePolicy,
    private readonly formatter: CritiqueFormatter,
  ) {}

  /** Returns null when no critique is needed; otherwise the inline nudge. */
  run(input: CritiqueInput): CritiqueResult | null {
    const should = this.policy.shouldCritique({
      editedPaths: input.editedPaths,
      turn: input.turn,
      lastToolOk: true,
      passes: this.passes,
    });
    if (!should) return null;
    this.passes += 1;
    return {
      pass: true,
      nudge: this.formatter.format(input),
      passes: this.passes,
    };
  }

  reset(): void {
    this.passes = 0;
  }
}
