/**
 * SemanticValidator — layer 2 of Plan V2 validation.
 *
 * Schema validity ≠ semantic validity. Constrained decoding guarantees the
 * plan is well-formed JSON; it says nothing about whether the referenced
 * files exist, whether task dependencies form a valid DAG, or whether a
 * verification command is even runnable. That's this file's job.
 *
 * Design: deterministic checks only. All of these are answerable without
 * asking another LLM call:
 *  - files with intent 'read' | 'modify' must exist on disk
 *    (intent 'create' is exempt — the task is expected to create it)
 *  - dependencies must reference real task ids in the same plan
 *  - the dependency graph must not contain cycles
 *  - every task should declare at least one verification step (warning,
 *    not an error — some tasks are genuinely unverifiable automatically)
 *
 * A `FileExistenceChecker` is injected rather than importing `fs` directly,
 * so this stays unit-testable without a real workspace and swappable for a
 * remote/virtual filesystem later (e.g. a VS Code FS provider).
 */
import type { PlanLLMOutput } from '../schema';
import type { ValidationIssue } from '../FailureContext';

export type FileExistenceChecker = (relativePath: string) => boolean | Promise<boolean>;

export interface SemanticValidationOptions {
  fileExists: FileExistenceChecker;
}

export async function validateSemantics(
  plan: PlanLLMOutput,
  options: SemanticValidationOptions
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const taskIds = new Set(plan.tasks.map((t) => t.id));

  if (plan.tasks.length === 0) {
    issues.push({
      code: 'EMPTY_TASK_LIST',
      message: 'Plan has no tasks.',
      severity: 'error'
    });
  }

  for (const task of plan.tasks) {
    // File existence — only for files the task expects to already exist.
    for (const file of task.files) {
      if (file.intent === 'create') continue;
      if (!(await options.fileExists(file.path))) {
        issues.push({
          code: 'FILE_NOT_FOUND',
          message: `${file.path} does not exist (task expects intent "${file.intent}").`,
          severity: 'error',
          taskId: task.id,
          path: file.path
        });
      }
    }

    // Dependency references must point at real tasks (and not at itself).
    for (const dep of task.dependencies) {
      if (dep === task.id) {
        issues.push({
          code: 'DEPENDENCY_CYCLE',
          message: `Task "${task.id}" depends on itself.`,
          severity: 'error',
          taskId: task.id
        });
        continue;
      }
      if (!taskIds.has(dep)) {
        issues.push({
          code: 'DEPENDENCY_MISSING',
          message: `Task "${task.id}" declares dependency "${dep}" which does not exist in this plan.`,
          severity: 'error',
          taskId: task.id
        });
      }
    }

    if (task.verification.length === 0) {
      issues.push({
        code: 'NO_VERIFICATION',
        message: `Task "${task.id}" has no automatic verification step. It will require manual verification before the plan can be considered complete.`,
        severity: 'warning',
        taskId: task.id
      });
    }
  }

  const cycle = findDependencyCycle(plan);
  if (cycle) {
    issues.push({
      code: 'DEPENDENCY_CYCLE',
      message: `Dependency cycle detected: ${cycle.join(' -> ')}.`,
      severity: 'error'
    });
  }

  return issues;
}

/** Simple DFS cycle detection over the task dependency graph.
 *  Returns the cyclic path (task ids) if found, else null. */
function findDependencyCycle(plan: PlanLLMOutput): string[] | null {
  const graph = new Map<string, string[]>();
  for (const t of plan.tasks) graph.set(t.id, t.dependencies);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.keys()) color.set(id, WHITE);
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    path.push(node);
    for (const dep of graph.get(node) || []) {
      if (!graph.has(dep)) continue; // reported separately as DEPENDENCY_MISSING
      if (color.get(dep) === GRAY) {
        const start = path.indexOf(dep);
        return [...path.slice(start), dep];
      }
      if (color.get(dep) === WHITE) {
        const found = dfs(dep);
        if (found) return found;
      }
    }
    path.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const id of graph.keys()) {
    if (color.get(id) === WHITE) {
      const found = dfs(id);
      if (found) return found;
    }
  }
  return null;
}
