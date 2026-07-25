/**
 * PlanEnforcement - Plan 없이 코드 작성 시도 시 경고 (C5-T25)
 */
import { ComplexityHeuristic } from './ComplexityHeuristic';

export class PlanEnforcement {
  private heuristic = new ComplexityHeuristic();
  private warned = false;

  /**
   * Check if a tool call should trigger a Plan mode warning
   */
  shouldWarn(toolName: string, args: any, userMessage: string): { warn: boolean; message: string } {
    // Only warn on write tools
    if (toolName !== 'edit_file' && toolName !== 'write_file') {
      return { warn: false, message: '' };
    }

    // Check complexity heuristic
    const result = this.heuristic.analyze(userMessage, args?.hunks?.length || 1);

    if (result.shouldSuggestPlan && !this.warned) {
      this.warned = true;
      return {
        warn: true,
        message: this.heuristic.buildSuggestion(result)
      };
    }

    return { warn: false, message: '' };
  }

  /**
   * Check if a user message should trigger Plan suggestion
   */
  shouldSuggestPlan(userMessage: string): boolean {
    const result = this.heuristic.analyze(userMessage, 0);
    return result.shouldSuggestPlan;
  }

  /**
   * Reset warning state (e.g., on mode switch)
   */
  reset(): void {
    this.warned = false;
  }
}
