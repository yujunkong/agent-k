/**
 * FailureRecovery - Plan 실패 시 복구 플로우 (C5-T11)
 * 
 * 실패 시:
 * 1. 변경 revert (CheckpointManager)
 * 2. 계획 다듬기 (Plan Review로 복귀)
 * 3. 재승인
 * 4. 재실행
 */
import type { PlanDocument } from './PlanGenerator';

export interface FailureContext {
  planDocument: PlanDocument;
  failedStep: number;
  errorMessage: string;
  checkpointId?: string;
}

export class FailureRecovery {
  /**
   * Build a recovery prompt to guide the model back to planning
   */
  buildRecoveryPrompt(context: FailureContext): string {
    return [
      '## ⚠️ Implementation Failed',
      '',
      `**Failed at Step ${context.failedStep}**: ${this.getStepText(context.planDocument, context.failedStep)}`,
      '',
      `**Error**: ${context.errorMessage}`,
      '',
      '### Recovery Actions',
      '',
      '1. Review the checkpoint to understand what changed',
      '2. Identify what went wrong in the plan for this step',
      '3. The plan will be adjusted and you can re-approve',
      '',
      '### Possible Issues',
      '',
      '- The step may have been too complex — consider splitting it',
      '- Dependencies may have been missed',
      '- The approach may need reconsideration',
      '',
      'Return to plan review to adjust and re-approve.'
    ].join('\n');
  }

  /**
   * Build a differential prompt showing what to fix in the plan
   */
  buildPlanAdjustmentPrompt(context: FailureContext): string {
    const todos = this.extractPlanTodos(context.planDocument);
    const failedTodo = todos[context.failedStep - 1] || 'Unknown step';

    return [
      '## 🔧 Plan Adjustment Needed',
      '',
      `The following step failed during implementation:`,
      '',
      `**Step ${context.failedStep}**: ${failedTodo}`,
      '',
      `**Error**: ${context.errorMessage}`,
      '',
      '### Adjustment Options',
      '',
      '1. **Simplify**: Break this step into smaller sub-steps',
      '2. **Reorder**: Move this step after other dependencies',
      '3. **Alternative approach**: Try a different implementation strategy',
      '4. **Skip**: Remove this step if it is no longer needed',
      '',
      'Update the plan document above and re-approve.'
    ].join('\n');
  }

  /**
   * Check if a failure is recoverable
   */
  isRecoverable(error: string): boolean {
    const unrecoverable = [
      'permission denied',
      'authentication failed',
      'disk full',
      'out of memory'
    ];
    return !unrecoverable.some(u => error.toLowerCase().includes(u));
  }

  private getStepText(plan: PlanDocument, stepNumber: number): string {
    const todos = this.extractPlanTodos(plan);
    return todos[stepNumber - 1] || 'Unknown step';
  }

  private extractPlanTodos(plan: PlanDocument): string[] {
    const todoSection = plan.sections.find(s => s.id === 'todos');
    if (!todoSection) return [];
    
    const todos: string[] = [];
    const regex = /\*\*Step \d+\*\*: (.+)/g;
    let match;
    while ((match = regex.exec(todoSection.content)) !== null) {
      todos.push(match[1].trim());
    }
    return todos;
  }
}
