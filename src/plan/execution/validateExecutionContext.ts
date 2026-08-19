import * as path from 'path';
import * as fs from 'fs';
import {
  assertMatchingRepoRoot,
  formatTaskFileTargets,
} from '../v2/workspaceContext';
import type { PlanFileTarget } from '../v2/schema';
import type { ExecutionPlan, ExecutionPlanTask } from './types';

export type ExecutionContextIssueCode =
  | 'REPO_ROOT_MISMATCH'
  | 'UNRESOLVED_TASK_TARGETS';

export interface ExecutionContextIssue {
  code: ExecutionContextIssueCode;
  message: string;
}

/** Per-file preflight diagnostic emitted before task dispatch. */
export interface TaskFilePreflightEntry {
  path: string;
  intent: string;
  /** Existence at plan-generation time (from PlanFileTarget). */
  planTimeExists: boolean | undefined;
  planTimeResolution: string | undefined;
  /** Existence re-checked at execution time against the effective root. */
  executionTimeExists: boolean;
  effectiveRoot: string;
  verdict: 'ok' | 'missing_target' | 'create_ok';
}

export interface TaskPreflightReport {
  taskId: string;
  execution: string;
  repoRoot: string | undefined;
  worktreePath: string | undefined;
  effectiveRoot: string;
  entries: TaskFilePreflightEntry[];
  blocked: boolean;
  issue: ExecutionContextIssue | null;
}

export function validateExecutionPlanContext(
  plan: ExecutionPlan,
  actualRepoRoot?: string
): ExecutionContextIssue | null {
  if (plan.repoRoot && actualRepoRoot) {
    try {
      assertMatchingRepoRoot({
        expected: plan.repoRoot,
        actual: actualRepoRoot,
        stage: 'execution'
      });
    } catch (error) {
      return {
        code: 'REPO_ROOT_MISMATCH',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  return null;
}

function fileExistsSync(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Full preflight for a single task — re-checks file existence at execution
 * time against the effective root (repoRoot or worktreePath).
 *
 * Rules:
 * - create → always allowed (file absence is expected)
 * - modify/read + file exists at execution time → ok
 * - modify/read + file missing at execution time → missing_target (blocks task)
 */
export function preflightTaskFiles(
  plan: ExecutionPlan,
  task: ExecutionPlanTask,
  actualRepoRoot?: string
): TaskPreflightReport {
  const effectiveRoot = task.worktreePath ?? actualRepoRoot ?? plan.repoRoot ?? '';
  const entries: TaskFilePreflightEntry[] = [];

  for (const file of task.files) {
    const absPath = effectiveRoot ? path.resolve(effectiveRoot, file.path) : file.path;
    const executionTimeExists = effectiveRoot ? fileExistsSync(absPath) : false;

    let verdict: TaskFilePreflightEntry['verdict'];
    if (file.intent === 'create') {
      verdict = 'create_ok';
    } else if (executionTimeExists) {
      verdict = 'ok';
    } else {
      verdict = 'missing_target';
    }

    entries.push({
      path: file.path,
      intent: file.intent,
      planTimeExists: file.exists,
      planTimeResolution: file.resolution,
      executionTimeExists,
      effectiveRoot,
      verdict
    });
  }

  const missing = entries.filter((e) => e.verdict === 'missing_target');
  let issue: ExecutionContextIssue | null = null;
  if (missing.length > 0) {
    const detail = missing
      .map(
        (e) =>
          `  ${e.path} (intent: ${e.intent}, plan-time: ${e.planTimeResolution ?? 'unknown'}, ` +
          `exists@plan: ${e.planTimeExists ?? '?'}, exists@exec: ${e.executionTimeExists}, root: ${e.effectiveRoot})`
      )
      .join('\n');
    issue = {
      code: 'UNRESOLVED_TASK_TARGETS',
      message:
        `Task "${task.id}" (${task.execution}) cannot proceed — ${missing.length} file target(s) not found at execution time:\n` +
        detail +
        '\n\n' +
        `All file targets: ${formatTaskFileTargets(task.files)}\n` +
        `Effective workspace root: ${effectiveRoot}\n` +
        'These paths may be hallucinated from a different project structure, or the workspace may have changed since plan generation.'
    };
  }

  return {
    taskId: task.id,
    execution: task.execution,
    repoRoot: plan.repoRoot,
    worktreePath: task.worktreePath,
    effectiveRoot,
    entries,
    blocked: missing.length > 0,
    issue
  };
}

/**
 * Validate a task before dispatch. Combines repoRoot mismatch check with
 * execution-time file existence re-verification.
 */
export function validateTaskExecutionLaunch(
  plan: ExecutionPlan,
  task: ExecutionPlanTask,
  actualRepoRoot?: string
): ExecutionContextIssue | null {
  const planIssue = validateExecutionPlanContext(plan, actualRepoRoot);
  if (planIssue) return planIssue;

  const preflight = preflightTaskFiles(plan, task, actualRepoRoot);
  return preflight.issue;
}

export function executionIssueToTaskError(issue: ExecutionContextIssue): string {
  return issue.message;
}

export function formatPreflightReport(report: TaskPreflightReport): string {
  const lines = [
    `Task Preflight Report: ${report.taskId}`,
    `  execution: ${report.execution}`,
    `  repoRoot: ${report.repoRoot ?? '(none)'}`,
    `  worktreePath: ${report.worktreePath ?? '(none)'}`,
    `  effectiveRoot: ${report.effectiveRoot}`,
    `  blocked: ${report.blocked}`
  ];
  for (const entry of report.entries) {
    lines.push(
      `  [${entry.verdict}] ${entry.path} — intent=${entry.intent}, ` +
        `plan=${entry.planTimeResolution ?? '?'}(exists:${entry.planTimeExists ?? '?'}), ` +
        `exec-exists=${entry.executionTimeExists}`
    );
  }
  if (report.issue) {
    lines.push(`  ISSUE: [${report.issue.code}] ${report.issue.message}`);
  }
  return lines.join('\n');
}

/** Exported for tests. */
export function listUnresolvedExecutionTargets(task: {
  files: PlanFileTarget[];
}): PlanFileTarget[] {
  return task.files.filter(
    (file) =>
      (file.intent === 'modify' || file.intent === 'read') &&
      file.resolution === 'unresolved'
  );
}
