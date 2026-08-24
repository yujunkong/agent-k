import type { PlanFileTarget } from './schema';

export interface PlanWorkspaceContext {
  repoRoot: string;
  /** Workspace-relative paths sampled at plan generation time. */
  fileIndex?: string[];
}

export function normalizeRepoRoot(root: string): string {
  return root.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function repoRootsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeRepoRoot(a).toLowerCase() === normalizeRepoRoot(b).toLowerCase();
}

export function appendWorkspaceContextToResearch(
  researchContext: string,
  workspace: PlanWorkspaceContext
): string {
  const lines = [
    researchContext || '(none)',
    '',
    '## Workspace context (authoritative)',
    `Repository root: ${workspace.repoRoot}`,
    'Only reference files that appear below or were confirmed in research. Do not invent paths from other projects.'
  ];
  if (workspace.fileIndex && workspace.fileIndex.length > 0) {
    lines.push('', 'Sample of files in this workspace:');
    for (const file of workspace.fileIndex) {
      lines.push(`- ${file}`);
    }
  } else {
    lines.push('', '(Workspace file index unavailable — prefer intent "create" for new files.)');
  }
  return lines.join('\n');
}

export function assertMatchingRepoRoot(params: {
  expected?: string;
  actual?: string;
  stage: string;
}): void {
  const { expected, actual, stage } = params;
  if (!expected || !actual) return;
  if (repoRootsMatch(expected, actual)) return;
  throw new Error(
    `Plan ${stage} repoRoot mismatch. Plan was generated for "${expected}" but execution runs under "${actual}". Re-approve the plan from the correct workspace folder.`
  );
}

export function formatTaskFileTargets(files: PlanFileTarget[]): string {
  if (files.length === 0) return '';
  return files
    .map((file) => {
      const flags: string[] = [file.intent];
      if (file.resolution === 'unresolved') flags.push('unresolved');
      if (file.exists === true) flags.push('exists');
      return `${file.path} (${flags.join(', ')})`;
    })
    .join(', ');
}

export function unresolvedModifyOrReadTargets(files: PlanFileTarget[]): PlanFileTarget[] {
  return files.filter(
    (file) =>
      (file.intent === 'modify' || file.intent === 'read') &&
      file.resolution === 'unresolved'
  );
}
