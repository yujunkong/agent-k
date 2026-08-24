/**
 * CTX-010 File intent — core resolution logic from v2.1 Plan V2
 * (`FileIntent` in schema.ts + `resolvePlanFileTargets.ts`).
 *
 * Plan package / chat-ui keep full PlanDocument schemas; core owns the
 * intent enum + existence resolution so CTX/prefetch/plan can share it
 * without pulling zod PlanLLMOutput into core.
 */

/** How a task/request relates to a file (planner + prefetch). */
export type FileIntent = 'read' | 'modify' | 'create';

export type FileTargetResolution = 'resolved' | 'unresolved';

/** File ref before workspace existence check. */
export interface FileIntentRef {
  path: string;
  intent: FileIntent;
}

/** Runtime target after existence resolution (does not mutate planner intent). */
export interface ResolvedFileTarget extends FileIntentRef {
  exists?: boolean;
  resolution?: FileTargetResolution;
}

export type FileExistenceChecker = (path: string) => boolean | Promise<boolean>;

/**
 * Resolve a single path+intent against workspace existence.
 * - `create`: always `resolved` (missing file is expected); still records `exists`.
 * - `read` / `modify`: `unresolved` when path is missing so callers can continue.
 */
export async function resolveFileIntent(
  ref: FileIntentRef,
  fileExists: FileExistenceChecker
): Promise<ResolvedFileTarget> {
  const exists = await fileExists(ref.path);
  if (ref.intent === 'create') {
    return { ...ref, exists, resolution: 'resolved' };
  }
  return {
    ...ref,
    exists,
    resolution: exists ? 'resolved' : 'unresolved',
  };
}

/** Batch resolve; order preserved. */
export async function resolveFileIntents(
  refs: FileIntentRef[],
  fileExists: FileExistenceChecker
): Promise<ResolvedFileTarget[]> {
  const out: ResolvedFileTarget[] = [];
  for (const ref of refs) {
    out.push(await resolveFileIntent(ref, fileExists));
  }
  return out;
}

export function listUnresolvedFileTargets(targets: ResolvedFileTarget[]): ResolvedFileTarget[] {
  return targets.filter((t) => t.resolution === 'unresolved');
}

export function isFileIntent(value: unknown): value is FileIntent {
  return value === 'read' || value === 'modify' || value === 'create';
}
