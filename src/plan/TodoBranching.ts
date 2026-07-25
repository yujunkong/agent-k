/**
 * TodoBranching - TODO 우클릭 → 새 Agent 세션 분기 (C5-T08)
 * 
 * TODO 우클릭 → Branch to new Agent
 * 해당 TODO + plan 요약만 새 세션에 주입
 * 부모와 병렬 실행 가능
 */
import type { PlanDocument } from './PlanGenerator';
import { planGenerator } from './PlanGenerator';

export interface BranchSession {
  id: string;
  parentPlanSlug: string;
  todoIndex: number;
  todoText: string;
  contextSummary: string;
  status: 'running' | 'completed' | 'failed';
  result?: string;
}

export class TodoBranching {
  private branches: BranchSession[] = [];

  /**
   * Create a new branch session for a specific TODO item
   */
  createBranch(planDocument: PlanDocument, todoIndex: number): BranchSession {
    const todos = planGenerator.extractTodos(planDocument.content);
    if (todoIndex < 0 || todoIndex >= todos.length) {
      throw new Error(`Invalid todo index ${todoIndex}. Plan has ${todos.length} steps.`);
    }

    const branch: BranchSession = {
      id: `branch-${Date.now()}-${todoIndex}`,
      parentPlanSlug: planDocument.slug,
      todoIndex,
      todoText: todos[todoIndex],
      contextSummary: this.buildBranchContext(planDocument, todos[todoIndex], todoIndex),
      status: 'running'
    };

    this.branches.push(branch);
    return branch;
  }

  /**
   * Complete a branch session with the result
   */
  completeBranch(branchId: string, result: string): void {
    const branch = this.branches.find(b => b.id === branchId);
    if (branch) {
      branch.status = 'completed';
      branch.result = result;
    }
  }

  /**
   * Fail a branch session
   */
  failBranch(branchId: string, error: string): void {
    const branch = this.branches.find(b => b.id === branchId);
    if (branch) {
      branch.status = 'failed';
      branch.result = error;
    }
  }

  /**
   * Get all active branches
   */
  getActiveBranches(): BranchSession[] {
    return this.branches.filter(b => b.status === 'running');
  }

  /**
   * Get all branches for a specific plan
   */
  getBranchesForPlan(slug: string): BranchSession[] {
    return this.branches.filter(b => b.parentPlanSlug === slug);
  }

  /**
   * Merge a completed branch result back into the parent plan context
   */
  getBranchMergeBlock(branchId: string): string {
    const branch = this.branches.find(b => b.id === branchId);
    if (!branch || branch.status !== 'completed') return '';

    return [
      `<branch-result id="${branch.id}">`,
      `  **Step ${branch.todoIndex + 1}**: ${branch.todoText}`,
      `  **Status**: ${branch.status}`,
      `  **Result**: ${branch.result || 'Completed'}`,
      `</branch-result>`
    ].join('\n');
  }

  private buildBranchContext(plan: PlanDocument, todoText: string, todoIndex: number): string {
    // Include only the relevant section context for the branch
    const relevantSection = plan.sections.find(s => s.id === 'todos');
    const contextLines = [
      `## Branched Task from Plan: ${plan.title}`,
      ``,
      `**Step ${todoIndex + 1}**: ${todoText}`,
      ``,
      relevantSection ? `**Full TODO list for context:**\n${relevantSection.content}` : '',
      ``,
      `Focus only on this step. Do not modify other steps.`,
    ];
    return contextLines.join('\n');
  }
}
