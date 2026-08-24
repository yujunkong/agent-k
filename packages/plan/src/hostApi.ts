/**
 * Host-facing Plan generate / execute helpers (HOST-008b).
 */

import {
  PlanSchemaGenerator,
  LiteLLMPlanModel,
} from './session';
import {
  buildExecutionPlan,
  runPlanExecution,
  type PlanExecutionDeps,
  type ExecutionPlan,
} from './execution';
import {
  persistPlanDocument,
  type PlanFs,
} from './storage';
import type { PlanDocument, PlanGenerationResult, FileExistenceChecker } from './session';
import type { LLMProviderInterface } from '@agent-k/providers';
import * as fs from 'fs';
import * as path from 'path';

export type GeneratePlanForHostParams = {
  goal: string;
  researchContext?: string;
  rejectionFeedback?: string;
  repoRoot?: string;
  provider: LLMProviderInterface;
  model?: string;
  signal?: AbortSignal;
  fileExists?: FileExistenceChecker;
  /** Persist under .agentk/plans when repoRoot set. */
  persist?: boolean;
};

const nodePlanFs: PlanFs = {
  mkdir: (dir) => {
    fs.mkdirSync(dir, { recursive: true });
  },
  writeFile: (filePath, contents) => {
    fs.writeFileSync(filePath, contents, 'utf8');
  },
  readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
};

/** Default existence check against the workspace filesystem. */
function defaultFileExists(repoRoot?: string): FileExistenceChecker {
  return (filePath: string) => {
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.join(repoRoot || process.cwd(), filePath);
    try {
      return fs.existsSync(abs);
    } catch {
      return false;
    }
  };
}

/** Run constrained Plan V2 generation for the host bridge. */
export async function generatePlanForHost(
  params: GeneratePlanForHostParams,
): Promise<PlanGenerationResult> {
  const model = new LiteLLMPlanModel(params.provider, {
    model: params.model,
    signal: params.signal,
  });
  const fileExists = params.fileExists ?? defaultFileExists(params.repoRoot);
  const generator = new PlanSchemaGenerator(model, fileExists);
  const result = await generator.generate({
    goal: params.goal,
    researchContext: params.researchContext ?? '',
    rejectionFeedback: params.rejectionFeedback,
    repoRoot: params.repoRoot,
  });

  if (result.ok && result.plan && params.persist && params.repoRoot) {
    await persistPlanDocument(nodePlanFs, params.repoRoot, result.plan);
  }

  return result;
}

export type ExecutePlanForHostParams = {
  document: PlanDocument;
  taskIds?: string[];
  deps: PlanExecutionDeps;
};

/**
 * Build an ExecutionPlan from the card document and run the DAG engine.
 * Partial Build: when taskIds set, only those tasks are included.
 */
export async function executePlanForHost(
  params: ExecutePlanForHostParams,
): Promise<{ plan: ExecutionPlan }> {
  let doc = params.document;
  if (params.taskIds && params.taskIds.length > 0) {
    const allow = new Set(params.taskIds);
    doc = {
      ...doc,
      tasks: doc.tasks.filter((t) => allow.has(t.id)),
    };
  }
  const executionPlan = buildExecutionPlan(doc);
  const finished = await runPlanExecution(executionPlan, params.deps);
  return { plan: finished };
}

export function resolveWorkspaceRepoRoot(
  workspaceFolders: ReadonlyArray<{ uri: { fsPath: string } }> | undefined,
): string | undefined {
  const first = workspaceFolders?.[0]?.uri?.fsPath;
  if (!first) return undefined;
  return path.resolve(first);
}
