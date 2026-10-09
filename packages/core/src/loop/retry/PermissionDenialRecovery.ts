/**
 * V31-RETRY-04 — PermissionDenialRecovery.
 *
 * A denied tool must not kill the run. The loop converts the denial into an
 * actionable tool result and lets the agent pick an alternative — bounded to
 * one recovery per run so a blocked agent cannot loop forever.
 */

export interface PermissionDenialInput {
  toolName: string;
  turn: number;
}

export interface PermissionDenialResult {
  recover: boolean;
  nudge: string;
}

export class PermissionDenialRecovery {
  constructor(private readonly maxRecoveries = 1) {}

  private used = 0;

  /** Decide whether to recover from a denial; increments the budget when true. */
  onDenied(input: PermissionDenialInput): PermissionDenialResult {
    if (this.used >= this.maxRecoveries) {
      return {
        recover: false,
        nudge: `Permission denied for "${input.toolName}". Stop and report what you need.`,
      };
    }
    this.used += 1;
    return {
      recover: true,
      nudge:
        `Permission denied for "${input.toolName}". ` +
        `Choose an alternative approach that does not require this tool, ` +
        `or ask the user to grant permission.`,
    };
  }

  reset(): void {
    this.used = 0;
  }
}
