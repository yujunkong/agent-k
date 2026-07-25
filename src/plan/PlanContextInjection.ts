/**
 * PlanContextInjection - Agent 모드 실행 중 "Per plan step N..." 컨텍스트 주입 (C5-T24)
 */
import type { PlanDocument } from './PlanGenerator';
import { planGenerator } from './PlanGenerator';

export class PlanContextInjection {
  private currentStep = 0;
  private planDocument: PlanDocument | null = null;

  setPlan(doc: PlanDocument): void {
    this.planDocument = doc;
    this.currentStep = 0;
  }

  advanceStep(): number {
    this.currentStep++;
    return this.currentStep;
  }

  /**
   * Build "Per plan step N" context injection for Agent mode
   */
  getStepContext(): string {
    if (!this.planDocument) return '';

    const todos = planGenerator.extractTodos(this.planDocument.content);
    const totalSteps = todos.length;
    const step = Math.min(this.currentStep, totalSteps - 1);
    const currentTodo = todos[step] || 'Complete remaining tasks';
    const nextTodo = step + 1 < totalSteps ? todos[step + 1] : null;

    const lines = [
      '---',
      `### Per Plan: Step ${step + 1}/${totalSteps}`,
      '',
      `**Current**: ${currentTodo}`,
      ...(nextTodo ? [`**Next**: ${nextTodo}`] : ['**This is the final step.**']),
      '',
      `**Completed**: ${step}/${totalSteps} steps`,
      '---'
    ];

    return lines.join('\n');
  }

  /**
   * Check if all plan steps are completed
   */
  isPlanComplete(): boolean {
    if (!this.planDocument) return false;
    const todos = planGenerator.extractTodos(this.planDocument.content);
    return this.currentStep >= todos.length;
  }
}
