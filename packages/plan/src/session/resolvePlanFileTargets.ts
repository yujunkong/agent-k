import type { PlanLLMOutput, PlanTask, PlanFileTarget } from './schema';
import type { FileExistenceChecker } from './validators/SemanticValidator';

/**
 * Enrich LLM file refs with workspace existence + resolution metadata.
 * Does not mutate planner intent — missing modify/read targets stay as-is
 * but are marked `unresolved` so generation can continue.
 */
export async function resolvePlanFileTargets(
  plan: PlanLLMOutput,
  fileExists: FileExistenceChecker
): Promise<PlanTask[]> {
  const tasks: PlanTask[] = [];

  for (const task of plan.tasks) {
    const files: PlanFileTarget[] = [];
    for (const file of task.files) {
      if (file.intent === 'create') {
        const exists = await fileExists(file.path);
        files.push({
          ...file,
          exists,
          resolution: 'resolved'
        });
        continue;
      }

      const exists = await fileExists(file.path);
      files.push({
        ...file,
        exists,
        resolution: exists ? 'resolved' : 'unresolved'
      });
    }
    tasks.push({ ...task, files });
  }

  return tasks;
}

/** Tasks referencing paths that were not found in the workspace. */
export function listUnresolvedPlanFileTargets(tasks: PlanTask[]): PlanFileTarget[] {
  return tasks.flatMap((task) =>
    task.files.filter((file) => file.resolution === 'unresolved')
  );
}
